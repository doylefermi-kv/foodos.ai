const SEGMENTS = [
  { n: '01', title: 'QSR & takeaway', body: 'Token numbers, fast counter billing, peak-hour queues.' },
  { n: '02', title: 'Cafés & bakeries', body: 'Open tabs, weight items, loyalty for regulars.' },
  { n: '03', title: 'Cloud kitchens', body: 'Many brands, one kitchen, every aggregator in one queue.' },
  { n: '04', title: 'Fine dining', body: 'Course-wise KOTs, reservations, waiter-wise reports.' },
  { n: '05', title: 'Chains', body: 'Central menu, outlet comparison, franchise access.' },
]

export function WhoItsFor() {
  return (
    <section className="section" id="who" aria-labelledby="who-h">
      <div className="wrap">
        <div className="head head--narrow">
          <span className="sticker sticker--mint">Who it's for</span>
          <h2 id="who-h">From one counter to twenty outlets.</h2>
        </div>
        <ul className="who">
          {SEGMENTS.map((segment) => (
            <li className="who__c" key={segment.n}>
              <b aria-hidden="true">{segment.n}</b>
              <h3>{segment.title}</h3>
              <p>{segment.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
