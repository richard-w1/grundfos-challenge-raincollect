import { useStore } from '../store'
import WeightSliders from './WeightSliders'

export default function ScoreSliders() {
  const weights = useStore((s) => s.scoreWeights)
  const updateWeights = useStore((s) => s.updateWeights)

  return <WeightSliders weights={weights} onChange={updateWeights} compact />
}
