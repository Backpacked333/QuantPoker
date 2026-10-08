import { installSimulationWorker, type WorkerScope } from './simulation'

installSimulationWorker(self as unknown as WorkerScope)
