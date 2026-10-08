import { ArrowRight, Crosshair, ShieldCheck } from 'lucide-react'
import type { LabModel } from './labModel'
import { pct, signed } from '../format'

const actionLabel = (lab: LabModel) =>
  lab.action === 'fold'
    ? 'fold'
    : lab.action === 'raise'
      ? `raise to ${lab.raiseTo}`
      : lab.call
        ? `call ${lab.call}`
        : 'check'

export function OptionsView({ lab }: { lab: LabModel }) {
  const vol = lab.next?.volatility
  return (
    <>
      <div className="option-map">
        <div>
          <span className="label">Poker state</span>
          <strong>{pct(lab.scenario.equity)} claim probability</strong>
          <small>from the cards you can see and Atlas&apos;s actions</small>
        </div>
        <ArrowRight size={16} />
        <div>
          <span className="label">Market lens</span>
          <strong>{lab.exposure} chip premium-like cost</strong>
          <small>for a claim on the {lab.pot}-chip pot</small>
        </div>
      </div>
      <div className="metric-pair">
        <div>
          <span className="label">Exercise frontier</span>
          <strong>{pct(lab.breakEven)}</strong>
          <small>equity where continuing turns positive</small>
        </div>
        <div>
          <span className="label">Choice value now</span>
          <strong className="positive">
            {signed(Math.max(0, lab.selectedEV))}
          </strong>
          <small>max(fold, {actionLabel(lab)})</small>
        </div>
      </div>
      <div className="greeks">
        <div>
          <span>Δ Delta-like</span>
          <strong>{lab.deltaPerPoint.toFixed(1)} chips / 1%</strong>
          <p>
            How fast decision EV moves when equity moves. Local sensitivity, not
            an option Greek.
          </p>
        </div>
        <div>
          <span>σ Next-card swing</span>
          <strong>
            {vol == null
              ? lab.cardsToCome
                ? 'After the flop'
                : 'No reveal left'
              : pct(vol)}
          </strong>
          <p>How widely the next public card can reprice your equity.</p>
        </div>
        <div>
          <span>τ Information clock</span>
          <strong>
            {lab.cardsToCome} reveal{lab.cardsToCome === 1 ? '' : 's'}
          </strong>
          <p>
            Poker reveals information in a few discrete steps. Markets trade
            continuously.
          </p>
        </div>
        <div>
          <span>Γ Convexity</span>
          <strong>The kink at EV = 0</strong>
          <p>
            The right to fold clips decision value at zero before you commit.
            After you pay, losses are real.
          </p>
        </div>
      </div>
      <div className="insight">
        <Crosshair size={17} />
        <div>
          <h4>A contingent claim, not a traded call option.</h4>
          <p>
            Your decision pays differently in future states: win, tie or lose.
            The map shows the value of choosing between folding and continuing
            as equity and price change. Poker has no traded underlying,
            Black–Scholes dynamics or continuous hedging.
          </p>
        </div>
      </div>
    </>
  )
}

export function ProtectionView({
  lab,
  onCoverage,
}: {
  lab: LabModel
  onCoverage: (value: number) => void
}) {
  const after = Math.max(0, lab.exposure - lab.coverage + lab.premium)
  return (
    <>
      <div className="override">
        <label htmlFor="coverage">
          Hypothetical coverage of the {actionLabel(lab)} exposure{' '}
          <strong>
            {Math.round((lab.coverage / Math.max(1, lab.exposure)) * 100)}%
          </strong>
        </label>
        <input
          id="coverage"
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={lab.scenario.coverageFraction}
          disabled={!lab.exposure}
          onChange={(e) => onCoverage(Number(e.target.value))}
        />
        <small>
          A teaching overlay for risk transfer. No policy exists and your chips
          are unchanged.
        </small>
      </div>
      <div className="transfer">
        <div>
          <span className="label">Unhedged bad state</span>
          <strong>−{lab.exposure.toFixed(0)}</strong>
          <span className="transfer-bar">
            <i style={{ width: lab.exposure ? '100%' : '0%' }} />
          </span>
        </div>
        <ArrowRight size={17} />
        <div>
          <span className="label">After fair protection</span>
          <strong>−{after.toFixed(1)}</strong>
          <span className="transfer-bar protected">
            <i
              style={{
                width: `${lab.exposure ? Math.min(100, (after / lab.exposure) * 100) : 0}%`,
              }}
            />
          </span>
        </div>
      </div>
      <div className="metric-pair">
        <div>
          <span className="label">Fair premium</span>
          <strong>{lab.premium.toFixed(1)} chips</strong>
          <small>
            {pct(lab.lossProbability)} loss probability ×{' '}
            {lab.coverage.toFixed(0)} coverage
          </small>
        </div>
        <div>
          <span className="label">Outcome spread</span>
          <strong>{lab.hedged.toFixed(1)}</strong>
          <small>down from {lab.unhedged.toFixed(1)} chips</small>
        </div>
      </div>
      <div className="insight">
        <ShieldCheck size={17} />
        <div>
          <h4>Fair protection changes the shape, not the average.</h4>
          <p>
            The policy pays {lab.coverage.toFixed(0)} chips only in the losing
            state and charges its expected payout up front. Ties and Atlas folds
            pay nothing. Expected wealth is unchanged before fees while the
            spread of outcomes falls. Real insurance adds expenses, exclusions
            and correlated losses.
          </p>
        </div>
      </div>
    </>
  )
}
