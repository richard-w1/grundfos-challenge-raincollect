import json
with open('rainuse-nexus/public/data/audit_manifest.json') as f:
    data = json.load(f)
print('Valid JSON -', len(data['audits']), 'cities')
for a in data['audits']:
    print(f"  {a['id']:15} count={a.get('building_count','?'):4}  precip={a.get('avg_precip_inches','?'):5}\"  total_cost=${a.get('total_water_cost_per_kgal','?')}")
