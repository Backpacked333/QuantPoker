import { useState } from 'react'
import { ArrowRight, Check, CircleCheck, RotateCcw } from 'lucide-react'
import type { Module } from '../curriculum'

export function Checkpoint({
  module,
  completed,
  onComplete,
  onNext,
}: {
  module: Module
  completed: boolean
  onComplete: () => void
  onNext: () => void
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)
  const score = module.questions.filter(
    (question, i) => answers[i] === question.correct,
  ).length
  const allAnswered = module.questions.every((_, i) => answers[i] !== undefined)
  const passed = submitted && score === module.questions.length
  return (
    <div className="checkpoint">
      <div className="eyebrow">PUT YOUR UNDERSTANDING TO WORK</div>
      <h3>Think it through.</h3>
      <p>Two questions. No timer. Get both right to complete this module.</p>
      {completed && !passed ? (
        <p className="already-complete">
          <CircleCheck size={16} /> You’ve completed this module. Practice again
          anytime.
        </p>
      ) : null}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!allAnswered) return
          setSubmitted(true)
          if (score === module.questions.length) onComplete()
        }}
      >
        {module.questions.map((question, i) => (
          <fieldset className="question" key={question.prompt}>
            <legend>
              <span>0{i + 1}</span> {question.prompt}
            </legend>
            {question.choices.map((choice, j) => (
              <label
                className={`answer ${answers[i] === j ? 'selected' : ''} ${submitted && j === question.correct ? 'correct' : ''} ${submitted && answers[i] === j && j !== question.correct ? 'incorrect' : ''}`}
                key={choice}
              >
                <input
                  type="radio"
                  name={`question-${i}`}
                  checked={answers[i] === j}
                  disabled={submitted}
                  onChange={() => setAnswers({ ...answers, [i]: j })}
                />
                <span>{choice}</span>
                {submitted && j === question.correct ? (
                  <Check size={16} />
                ) : null}
              </label>
            ))}
            {submitted ? (
              <p className="answer-explanation">{question.explanation}</p>
            ) : null}
          </fieldset>
        ))}
        {submitted ? (
          <div
            role="status"
            className={`checkpoint-result ${passed ? 'passed' : ''}`}
          >
            <h4>
              {passed
                ? 'Connection made.'
                : `${score} of ${module.questions.length} correct. Keep exploring.`}
            </h4>
            <p>
              {passed
                ? 'Module complete. You’ve added another tool to your decision-making toolkit.'
                : 'Read the explanations, revisit the lab, and give it another try.'}
            </p>
          </div>
        ) : (
          <button
            className="button primary"
            type="submit"
            disabled={!allAnswered}
          >
            Check my understanding <ArrowRight size={16} />
          </button>
        )}
      </form>
      {submitted ? (
        <div className="checkpoint-actions">
          <button
            className="button secondary"
            onClick={() => {
              setAnswers({})
              setSubmitted(false)
            }}
          >
            <RotateCcw size={15} /> Try again
          </button>
          {passed ? (
            <button className="button primary" onClick={onNext}>
              Continue learning <ArrowRight size={16} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
