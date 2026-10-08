import { useEffect, useId, useRef, useState } from 'react'
import {
  ArrowRight,
  BookOpen,
  Check,
  FlaskConical,
  Lightbulb,
} from 'lucide-react'
import type { HandLessonContent } from '../lib/hand-lesson'

const steps = ['Understand', 'Predict', 'Explore', 'Apply'] as const
type Step = (typeof steps)[number]
type Answer = { selected: string; reviewed: boolean }

export function HandLesson({
  lesson,
  ready,
  onExplore,
  onLesson,
  onAttempt,
}: {
  lesson: HandLessonContent
  ready: boolean
  onExplore: (x: number | null) => void
  onLesson: () => void
  onAttempt?: (
    stage: 'prediction' | 'transfer',
    answerId: string,
    correct: boolean,
  ) => void
}) {
  const [step, setStep] = useState<Step>('Understand')
  const [answers, setAnswers] = useState<
    Partial<Record<'Predict' | 'Apply', Answer>>
  >({})
  const [visited, setVisited] = useState<number | null>(null)
  const content = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  const id = useId()
  const question = step === 'Predict' ? lesson.prediction : lesson.transfer
  const answer =
    step === 'Predict' || step === 'Apply' ? answers[step] : undefined
  const correct = answer?.selected === question.answer
  const checks =
    Number(
      Boolean(
        answers.Predict?.reviewed &&
          answers.Predict.selected === lesson.prediction.answer,
      ),
    ) +
    Number(
      Boolean(
        answers.Apply?.reviewed &&
          answers.Apply.selected === lesson.transfer.answer,
      ),
    )

  useEffect(() => {
    if (moved.current) content.current?.focus({ preventScroll: true })
  }, [step])

  function goTo(next: Step) {
    moved.current = true
    setStep(next)
  }

  return (
    <section className="hand-lesson" aria-label="Hand-linked lesson">
      <div className="learning-goal">
        <span>
          <BookOpen size={13} /> YOUR LEARNING GOAL
        </span>
        <h3>{lesson.title}</h3>
        <p>{lesson.goal}</p>
      </div>
      <ol className="learning-path" aria-label="Learning steps">
        {steps.map((item, index) => (
          <li key={item}>
            <button
              aria-current={step === item ? 'step' : undefined}
              onClick={() => goTo(item)}
            >
              <span>{index + 1}</span>
              {item}
            </button>
          </li>
        ))}
      </ol>
      <div
        className="learning-stage"
        ref={content}
        tabIndex={-1}
        aria-label={`${step} step`}
      >
        {step === 'Understand' ? (
          <>
            <p className="learning-concept">{lesson.concept}</p>
            <div className="learning-context">
              <Lightbulb size={16} />
              <p>{lesson.context}</p>
            </div>
            <div className="learning-actions">
              <button
                className="learning-primary"
                onClick={() => goTo('Predict')}
              >
                Make a prediction <ArrowRight size={14} />
              </button>
              <button
                className="learning-text-button"
                onClick={() => goTo('Explore')}
              >
                Explore freely
              </button>
            </div>
          </>
        ) : step === 'Explore' ? (
          <>
            <span className="learning-kicker">
              <FlaskConical size={14} /> TRY AN EXPERIMENT
            </span>
            <p className="learning-concept">{lesson.experiment}</p>
            <div className="learning-experiments">
              {lesson.points.map((point, index) => (
                <button
                  key={point.label}
                  disabled={!ready}
                  aria-pressed={visited === index}
                  onClick={() => {
                    setVisited(index)
                    onExplore(point.x)
                  }}
                >
                  {point.label} <ArrowRight size={12} />
                </button>
              ))}
            </div>
            <p className="learning-note">
              {ready
                ? 'Experiments change only the model below—not your bet or your cards.'
                : 'The experiment will be ready when visible-card analysis finishes.'}
            </p>
            <button
              className="learning-text-button"
              onClick={() => goTo('Apply')}
            >
              Apply the idea beyond poker <ArrowRight size={14} />
            </button>
          </>
        ) : (
          <>
            <fieldset className="learning-question">
              <legend>{question.prompt}</legend>
              {question.choices.map((choice) => (
                <label
                  key={choice.id}
                  className={answer?.selected === choice.id ? 'chosen' : ''}
                >
                  <input
                    type="radio"
                    name={`${id}-${step}`}
                    value={choice.id}
                    checked={answer?.selected === choice.id}
                    onChange={() =>
                      setAnswers((previous) => ({
                        ...previous,
                        [step]: { selected: choice.id, reviewed: false },
                      }))
                    }
                  />
                  <span>{choice.label}</span>
                </label>
              ))}
            </fieldset>
            {answer?.reviewed && (
              <div
                className={`learning-feedback ${correct ? 'correct' : 'revisit'}`}
                role="status"
              >
                <strong>
                  {correct ? 'That’s the idea.' : 'Revisit the reasoning.'}
                </strong>
                <p>
                  {
                    question.choices.find(
                      (choice) => choice.id === answer.selected,
                    )?.feedback
                  }
                </p>
              </div>
            )}
            {step === 'Predict' && answer?.reviewed && (
              <div className="learning-working" aria-label="Worked example">
                <span className="learning-kicker">WORK IT THROUGH</span>
                <ol>
                  {lesson.working.map((row) => (
                    <li key={row.label}>
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {step === 'Apply' && answer?.reviewed && correct && (
              <div className="learning-takeaway">
                <Check size={16} />
                <p>{lesson.takeaway}</p>
              </div>
            )}
            <div className="learning-actions">
              {!answer?.reviewed ? (
                <button
                  className="learning-primary"
                  disabled={!answer}
                  onClick={() => {
                    setAnswers((previous) => ({
                      ...previous,
                      [step]: { selected: answer!.selected, reviewed: true },
                    }))
                    onAttempt?.(
                      step === 'Predict' ? 'prediction' : 'transfer',
                      answer!.selected,
                      correct,
                    )
                  }}
                >
                  Check my reasoning
                </button>
              ) : step === 'Predict' ? (
                <button
                  className="learning-primary"
                  onClick={() => goTo('Explore')}
                >
                  See it on the graph <ArrowRight size={14} />
                </button>
              ) : (
                <button className="learning-primary" onClick={onLesson}>
                  Read the full lesson <BookOpen size={14} />
                </button>
              )}
              {answer?.reviewed && (
                <button
                  className="learning-text-button"
                  onClick={() =>
                    setAnswers((previous) => ({
                      ...previous,
                      [step]: undefined,
                    }))
                  }
                >
                  Try again
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {step !== 'Understand' && (
        <div className="learning-footer">
          <span>{checks}/2 checks correct · this decision</span>
          <button onClick={() => onExplore(null)}>
            Open model <ArrowRight size={12} />
          </button>
        </div>
      )}
    </section>
  )
}
