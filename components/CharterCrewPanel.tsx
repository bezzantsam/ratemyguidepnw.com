import {charterCrewFor} from '@/lib/charter-crew';

export default function CharterCrewPanel({publicId}: {publicId: string}) {
  const crew = charterCrewFor(publicId);
  if (crew.length === 0) return null;

  return <section className="section card" aria-label="Saltwater charter crew">
    <h2>Meet the crew</h2>
    <ul>
      {crew.map(member => <li key={member.personId}>
        <strong>{member.name}</strong> · {member.role === 'deckhand' ? 'Deckhand' : 'Mate'}
        <p className="muted">Reported by a trip participant on {member.evidence.reportedOn}.
          {' '}Current assignment and credentials have not been independently checked.</p>
      </li>)}
    </ul>
    <p>The captain and crew are different people. Crew can vary by trip.</p>
    <p>In your <a href="#reviews">trip review</a>, you can describe the deckhand’s help,
      fish handling or service if you experienced it firsthand. Naming a crew member is optional.
      Reviews stay on this captain’s profile; crew members do not receive a separate rating.</p>
  </section>;
}
