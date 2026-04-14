"""
towerscout_train.py
-------------------
Run this in Google Colab to recreate the TowerScout YOLOv5 weights.

Upload this file to Colab, then in a cell run:
    !python towerscout_train.py

Requires: GPU runtime (Runtime > Change runtime type > GPU)
Expected time: ~45 min on A100, ~5 hours on T4

The finished weights will be saved to:
    /content/yolov5/runs/train/cooling_towers/weights/best.pt

Download them with:
    from google.colab import files
    files.download('/content/yolov5/runs/train/cooling_towers/weights/best.pt')
"""

import os
import re
import shutil
import subprocess
import sys


# ---------------------------------------------------------------------------
# CELL 1 — Clone YOLOv5 (latest, no version pin) and install dependencies
# ---------------------------------------------------------------------------

os.chdir('/content')

print("=== Cloning YOLOv5 ===")
subprocess.run(['git', 'clone', 'https://github.com/ultralytics/yolov5', '--quiet'], check=True)

os.chdir('/content/yolov5')

print("=== Installing dependencies ===")

# Install requirements but skip torch/torchvision/torchaudio — Colab provides
# CUDA-enabled builds of these already. Letting pip resolve them from
# requirements.txt replaces them with CPU-only wheels.
with open('/content/yolov5/requirements.txt') as f:
    req_lines = f.readlines()

SKIP_PKGS = {'torch', 'torchvision', 'torchaudio'}
filtered_reqs = []
for line in req_lines:
    # Strip inline comments and surrounding whitespace
    stripped = line.split('#')[0].strip()
    if not stripped:
        continue
    pkg_name = re.split(r'[><=!;\s]', stripped)[0].strip().lower()
    if pkg_name in SKIP_PKGS:
        print(f'  Skipping {pkg_name!r} (using Colab CUDA build)')
        continue
    filtered_reqs.append(stripped)

if filtered_reqs:
    subprocess.run(
        [sys.executable, '-m', 'pip', 'install', '-q'] + filtered_reqs,
        check=True,
    )

# Pin albumentations below v2 — v2 changed the pydantic schema and breaks
# the YOLOv5 augmentation setup with a "Field required: size" error.
subprocess.run(
    [sys.executable, '-m', 'pip', 'install', 'albumentations<2.0', '-q'],
    check=True,
)

print("Cell 1 done.\n")


# ---------------------------------------------------------------------------
# CELL 2 — Patch all torch.load() calls for PyTorch 2.6 compatibility
# ---------------------------------------------------------------------------

print("=== Patching torch.load for PyTorch 2.6 ===")

def patch_torch_load(src):
    result = []
    i = 0
    while i < len(src):
        match = re.search(r'torch\.load\(', src[i:])
        if not match:
            result.append(src[i:])
            break
        result.append(src[i:i + match.start()])
        start = i + match.start()
        pos = i + match.end()
        depth = 1
        while pos < len(src) and depth > 0:
            if src[pos] == '(':
                depth += 1
            elif src[pos] == ')':
                depth -= 1
            pos += 1
        call = src[start:pos]
        if 'weights_only' not in call:
            call = call[:-1] + ', weights_only=False)'
        result.append(call)
        i = pos
    return ''.join(result)

patched = 0
for root, dirs, files in os.walk('/content/yolov5'):
    dirs[:] = [d for d in dirs if not d.startswith('.')]
    for fname in files:
        if not fname.endswith('.py'):
            continue
        path = os.path.join(root, fname)
        with open(path) as f:
            src = f.read()
        if 'torch.load(' not in src:
            continue
        new_src = patch_torch_load(src)
        if new_src != src:
            with open(path, 'w') as f:
                f.write(new_src)
            print(f'  Patched: {os.path.relpath(path, "/content/yolov5")}')
            patched += 1

print(f"{patched} files patched.")
print("Cell 2 done.\n")


# ---------------------------------------------------------------------------
# CELL 3 — Download and merge Roboflow datasets
# ---------------------------------------------------------------------------

print("=== Downloading datasets ===")

DATASETS = {
    'nyc_base':    'https://app.roboflow.com/ds/TZWZCzobl7?key=vZdBJn4CTt',
    'philly_base': 'https://app.roboflow.com/ds/RqQao0QTfg?key=ziWnToKXwt',
    'nys_base':    'https://app.roboflow.com/ds/3VHlkp2ijS?key=f5AuciPAZa',
}

for split in ['train', 'valid', 'test']:
    for kind in ['images', 'labels']:
        os.makedirs(f'/content/{split}/{kind}', exist_ok=True)

for name, url in DATASETS.items():
    dl_dir = f'/content/{name}'

    # Skip if already downloaded and extracted from a previous run
    if os.path.isdir(dl_dir) and any(
        os.path.isdir(f'{dl_dir}/{s}/images') for s in ['train', 'valid', 'test']
    ):
        print(f"  {name}: already extracted, skipping download")
    else:
        print(f"  Downloading {name}...")
        os.makedirs(dl_dir, exist_ok=True)
        os.chdir(dl_dir)
        result = subprocess.run(
            f'curl -L "{url}" > roboflow.zip && unzip -q roboflow.zip && rm roboflow.zip',
            shell=True,
        )
        if result.returncode != 0:
            print(f"  WARNING: {name} download/unzip failed — skipping.")
            os.chdir('/content')
            continue

    # Merge into unified train/valid/test dirs
    for split in ['train', 'valid', 'test']:
        for kind in ['images', 'labels']:
            src_dir = f'{dl_dir}/{split}/{kind}'
            dst_dir = f'/content/{split}/{kind}'
            if os.path.isdir(src_dir):
                for fname in os.listdir(src_dir):
                    dst = os.path.join(dst_dir, fname)
                    if not os.path.exists(dst):
                        shutil.copy(os.path.join(src_dir, fname), dst)

    os.chdir('/content')

print("\nDataset counts:")
for split in ['train', 'valid', 'test']:
    n = len(os.listdir(f'/content/{split}/images'))
    print(f"  {split}: {n} images")

if len(os.listdir('/content/train/images')) == 0:
    print("ERROR: No training images found. Check the download URLs.")
    sys.exit(1)

print("Cell 3 done.\n")


# ---------------------------------------------------------------------------
# CELL 4 — Write data.yaml
# ---------------------------------------------------------------------------

print("=== Writing data.yaml ===")

yaml_content = (
    "train: /content/train/images\n"
    "val:   /content/valid/images\n"
    "test:  /content/test/images\n"
    "\n"
    "nc: 1\n"
    "names: ['ct']\n"
)

with open('/content/data.yaml', 'w') as f:
    f.write(yaml_content)

shutil.copy('/content/data.yaml', '/content/yolov5/data.yaml')
print("data.yaml written.")
print("Cell 4 done.\n")


# ---------------------------------------------------------------------------
# CELL 5 — Train
# ---------------------------------------------------------------------------

print("=== Starting training ===")
print("This will take ~45 min on A100 or ~5 hours on T4.\n")

os.chdir('/content/yolov5')

env = os.environ.copy()
env['WANDB_MODE'] = 'disabled'  # skip the wandb interactive prompt

result = subprocess.run(
    [
        sys.executable, 'train.py',
        '--img',     '640',
        '--batch',   '16',
        '--epochs',  '100',
        '--data',    '/content/data.yaml',
        '--weights', 'yolov5x.pt',
        '--cache',
        '--name',    'cooling_towers',
        '--exist-ok',
    ],
    env=env,
)

if result.returncode != 0:
    print("\nTraining failed. Check the output above for errors.")
    sys.exit(1)

print("\nCell 5 done.\n")


# ---------------------------------------------------------------------------
# CELL 6 — Verify output and print download instructions
# ---------------------------------------------------------------------------

best = '/content/yolov5/runs/train/cooling_towers/weights/best.pt'
last = '/content/yolov5/runs/train/cooling_towers/weights/last.pt'

print("=== Training complete ===")
if os.path.exists(best):
    size_mb = os.path.getsize(best) / 1e6
    print(f"best.pt found: {best} ({size_mb:.1f} MB)")
else:
    print("WARNING: best.pt not found — check training output above.")

print("""
To download the weights, run this in a new Colab cell:

    from google.colab import files
    files.download('/content/yolov5/runs/train/cooling_towers/weights/best.pt')

Or to save to Google Drive:

    from google.colab import drive
    drive.mount('/content/gdrive')
    import shutil
    shutil.copy(
        '/content/yolov5/runs/train/cooling_towers/weights/best.pt',
        '/content/gdrive/MyDrive/towerscout_best.pt'
    )
""")
