interface Language {
  native: string
  english: string
  sample: string
}

/** The nine languages the CTO asked to show. Order is the wheel's order. */
const LANGUAGES: Language[] = [
  { native: 'ગુજરાતી', english: 'Gujarati', sample: 'રસોડામાં મોકલ્યું' },
  { native: 'हिन्दी', english: 'Hindi', sample: 'ऑर्डर रसोई में भेजा गया' },
  { native: 'தமிழ்', english: 'Tamil', sample: 'சமையலறைக்கு அனுப்பப்பட்டது' },
  { native: 'తెలుగు', english: 'Telugu', sample: 'వంటగదికి పంపబడింది' },
  { native: 'മലയാളം', english: 'Malayalam', sample: 'അടുക്കളയിലേക്ക് അയച്ചു' },
  { native: 'ಕನ್ನಡ', english: 'Kannada', sample: 'ಅಡುಗೆಮನೆಗೆ ಕಳುಹಿಸಲಾಗಿದೆ' },
  { native: 'मराठी', english: 'Marathi', sample: 'ऑर्डर स्वयंपाकघरात पाठवली' },
  { native: 'বাংলা', english: 'Bengali', sample: 'রান্নাঘরে পাঠানো হয়েছে' },
  { native: 'English', english: 'English', sample: 'Order sent to the kitchen' },
]

/** BCP-47 tags, so a screen reader switches voice per row. */
const LANG_TAGS: Record<string, string> = {
  Gujarati: 'gu',
  Hindi: 'hi',
  Tamil: 'ta',
  Telugu: 'te',
  Malayalam: 'ml',
  Kannada: 'kn',
  Marathi: 'mr',
  Bengali: 'bn',
  English: 'en',
}

/**
 * The keyframes translate the track by one 74px row at a time and land on
 * -666px (= 9 rows) at 100%, which is the same visual position as 0 only if
 * the first three rows are repeated at the end. Hence 12 rows for 9 languages.
 *
 * The three duplicates exist purely to make the loop seamless, so they are
 * `aria-hidden` — and the reduced-motion rule in CSS hides them visually too,
 * turning the wheel into a plain list of nine.
 */
const LOOP_DUPLICATES = 3

export function LanguageWheel() {
  const rows = [...LANGUAGES, ...LANGUAGES.slice(0, LOOP_DUPLICATES)]

  return (
    <div className="wheel">
      <div className="wheel__band" aria-hidden="true" />
      <ul className="wheel__track" aria-label="Supported languages">
        {rows.map((language, index) => (
          <li
            className="wl"
            key={`${language.english}-${index}`}
            aria-hidden={index >= LANGUAGES.length ? true : undefined}
          >
            <b lang={LANG_TAGS[language.english]}>{language.native}</b>
            <i>{language.english}</i>
            <em lang={LANG_TAGS[language.english]}>{language.sample}</em>
          </li>
        ))}
      </ul>
    </div>
  )
}
