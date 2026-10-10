// Action codes for challenge lines: `f` fold, `c` check or call, `r<to>` bet
// or raise to `to`. Shared by the generator, the landing page and the tests;
// it imports only the engine, never the analysis.
import { legalActions } from '../lib/poker'
import type { Action, Game } from '../lib/poker'
import type { ActionCode } from './score'

export const codeOf = (action: Action): ActionCode =>
  action.type === 'fold' ? 'f' : action.type === 'raise' ? `r${action.to}` : 'c'

/** The engine action for `code` in `game` (check or call by the price). */
export function actionOf(game: Game, code: ActionCode): Action {
  if (code === 'f') return { type: 'fold' }
  if (code === 'c')
    return { type: legalActions(game).canCheck ? 'check' : 'call' }
  return { type: 'raise', to: Number(code.slice(1)) }
}
