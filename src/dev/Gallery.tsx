// Dev-only design QA page (#dev/gallery): every card and chip state at once.
import { deck } from '../lib/poker'
import { PlayingCard } from '../components/PlayingCard'

export default function Gallery() {
  const cards = deck()
  return (
    <div className="page gallery">
      <h1>Design gallery</h1>
      <section className="gallery-felt">
        {cards.map((card) => (
          <PlayingCard key={`${card.rank}${card.suit}`} card={card} size="lg" />
        ))}
      </section>
      <section className="gallery-felt">
        {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
          <PlayingCard key={size} card={{ rank: 13, suit: 'h' }} size={size} />
        ))}
        <PlayingCard card={{ rank: 12, suit: 's' }} faceDown size="lg" />
      </section>
    </div>
  )
}
