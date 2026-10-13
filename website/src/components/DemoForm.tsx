import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import {
  LIMITS,
  OUTLETS,
  RESTAURANT_TYPES,
  normalisePhone,
  validateDemoRequest,
  type DemoRequest,
  type DemoRequestField,
  type Outlets,
  type RestaurantType,
} from '../../shared/contract'
import { submitDemoRequest } from '../lib/api'
import { getAttribution } from '../lib/attribution'
import { Turnstile } from './Turnstile'

const OUTLET_LABELS: Record<Outlets, string> = {
  '1': 'Just the one',
  '2-5': '2 to 5',
  '6-20': '6 to 20',
  '20+': 'More than 20',
}

const TYPE_LABELS: Record<RestaurantType, string> = {
  qsr: 'QSR / takeaway',
  cafe: 'Café or bakery',
  cloud_kitchen: 'Cloud kitchen',
  casual_dining: 'Casual dining',
  fine_dining: 'Fine dining',
  bar: 'Bar / pub',
  other: 'Something else',
}

/** Matches the nine languages the AI section advertises. */
const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी · Hindi' },
  { code: 'ta', label: 'தமிழ் · Tamil' },
  { code: 'te', label: 'తెలుగు · Telugu' },
  { code: 'ml', label: 'മലയാളം · Malayalam' },
  { code: 'kn', label: 'ಕನ್ನಡ · Kannada' },
  { code: 'mr', label: 'मराठी · Marathi' },
  { code: 'bn', label: 'বাংলা · Bengali' },
  { code: 'gu', label: 'ગુજરાતી · Gujarati' },
]

interface FormState {
  name: string
  phone: string
  email: string
  restaurantName: string
  city: string
  outlets: string
  restaurantType: string
  preferredLanguage: string
  message: string
  consent: boolean
  website: string
}

const EMPTY: FormState = {
  name: '',
  phone: '',
  email: '',
  restaurantName: '',
  city: '',
  outlets: '',
  restaurantType: '',
  preferredLanguage: '',
  message: '',
  consent: false,
  website: '',
}

type FieldErrors = Partial<Record<DemoRequestField, string>>

/** Tab order, so "focus the first bad field" means the topmost one. */
const FIELD_ORDER: DemoRequestField[] = [
  'name',
  'phone',
  'restaurantName',
  'city',
  'outlets',
  'restaurantType',
  'email',
  'preferredLanguage',
  'message',
  'consent',
  'turnstileToken',
]

function toPayload(form: FormState, turnstileToken: string): DemoRequest {
  return {
    name: form.name.trim(),
    // Send the normalised form so the Sheet never holds two spellings of one
    // number; the function normalises again, which is fine and idempotent.
    phone: normalisePhone(form.phone) ?? form.phone.trim(),
    email: form.email.trim() || undefined,
    restaurantName: form.restaurantName.trim(),
    city: form.city.trim(),
    outlets: form.outlets as Outlets,
    restaurantType: (form.restaurantType || undefined) as RestaurantType | undefined,
    preferredLanguage: form.preferredLanguage || undefined,
    message: form.message.trim() || undefined,
    consent: true,
    attribution: getAttribution(),
    turnstileToken,
    website: form.website,
  }
}

interface Props {
  onDone: () => void
  /** Used only to title the success state; not sent to the API. */
  source: string | null
}

export function DemoForm({ onDone, source }: Props) {
  const uid = useId()
  const fieldId = (field: string) => `${uid}-${field}`
  const errId = (field: string) => `${uid}-${field}-err`

  const [form, setForm] = useState<FormState>(EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle')
  const [failure, setFailure] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)

  const formRef = useRef<HTMLFormElement>(null)
  const doneRef = useRef<HTMLDivElement>(null)
  // A second click landing between setState and the fetch would send twice;
  // state alone is too slow to guard that.
  const inFlight = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    if (status === 'done') doneRef.current?.focus()
  }, [status])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    // Clearing as the visitor types is the whole point of inline errors.
    setErrors((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key as DemoRequestField]
      return next
    })
  }

  const focusFirstError = (fieldErrors: FieldErrors) => {
    const first = FIELD_ORDER.find((field) => field in fieldErrors)
    if (!first) return
    const element = formRef.current?.querySelector<HTMLElement>(
      `#${CSS.escape(fieldId(first))}`,
    )
    element?.focus()
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (inFlight.current) return

    setFailure(null)

    const payload = toPayload(form, turnstileToken ?? '')
    const fieldErrors = validateDemoRequest(payload)
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      focusFirstError(fieldErrors)
      return
    }

    inFlight.current = true
    setStatus('sending')
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const result = await submitDemoRequest(payload, controller.signal)
    inFlight.current = false

    if (controller.signal.aborted) return

    switch (result.kind) {
      case 'ok':
        setCreatedId(result.id)
        setStatus('done')
        break
      case 'validation':
        setErrors(result.fields)
        setStatus('idle')
        focusFirstError(result.fields)
        break
      case 'error':
        setFailure(result.message)
        setStatus('idle')
        break
    }
  }

  if (status === 'done') {
    return (
      <div className="done" tabIndex={-1} ref={doneRef} role="status">
        <p className="done__tick" aria-hidden="true">
          ✓
        </p>
        <h3>
          {source === 'cta-waitlist' ? 'You’re on the list.' : 'Request received.'}
        </h3>
        <p>
          We’ll call you on <b>{normalisePhone(form.phone) ?? form.phone}</b>{' '}
          within one working day to fix a time. Keep your menu handy — we’ll set
          the demo up on your own dishes.
        </p>
        {createdId && <p className="done__ref">Reference: {createdId}</p>}
        <div className="done__actions">
          <button type="button" className="btn btn--primary" onClick={onDone}>
            Close
          </button>
        </div>
      </div>
    )
  }

  const sending = status === 'sending'
  const invalid = (field: DemoRequestField) =>
    errors[field]
      ? { 'aria-invalid': true as const, 'aria-describedby': errId(field) }
      : {}

  return (
    <form className="form__grid" ref={formRef} onSubmit={onSubmit} noValidate>
      {failure && (
        <p className="banner banner--bad" role="alert">
          <b>Couldn’t send</b>
          {failure}
        </p>
      )}

      <div className={errors.name ? 'field field--bad' : 'field'}>
        <label className="field__label" htmlFor={fieldId('name')}>
          Your name
        </label>
        <input
          id={fieldId('name')}
          name="name"
          type="text"
          autoComplete="name"
          maxLength={LIMITS.name.max}
          value={form.name}
          onChange={(event) => set('name', event.target.value)}
          {...invalid('name')}
        />
        {errors.name && (
          <p className="field__err" id={errId('name')}>
            {errors.name}
          </p>
        )}
      </div>

      <div className={errors.phone ? 'field field--bad' : 'field'}>
        <label className="field__label" htmlFor={fieldId('phone')}>
          Mobile number
        </label>
        <input
          id={fieldId('phone')}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          value={form.phone}
          onChange={(event) => set('phone', event.target.value)}
          {...invalid('phone')}
        />
        {errors.phone ? (
          <p className="field__err" id={errId('phone')}>
            {errors.phone}
          </p>
        ) : (
          <p className="field__hint">We call on this number. No spam.</p>
        )}
      </div>

      <div className={errors.restaurantName ? 'field field--bad' : 'field'}>
        <label className="field__label" htmlFor={fieldId('restaurantName')}>
          Restaurant name
        </label>
        <input
          id={fieldId('restaurantName')}
          name="restaurantName"
          type="text"
          autoComplete="organization"
          maxLength={LIMITS.restaurantName.max}
          value={form.restaurantName}
          onChange={(event) => set('restaurantName', event.target.value)}
          {...invalid('restaurantName')}
        />
        {errors.restaurantName && (
          <p className="field__err" id={errId('restaurantName')}>
            {errors.restaurantName}
          </p>
        )}
      </div>

      <div className={errors.city ? 'field field--bad' : 'field'}>
        <label className="field__label" htmlFor={fieldId('city')}>
          City
        </label>
        <input
          id={fieldId('city')}
          name="city"
          type="text"
          autoComplete="address-level2"
          maxLength={LIMITS.city.max}
          value={form.city}
          onChange={(event) => set('city', event.target.value)}
          {...invalid('city')}
        />
        {errors.city && (
          <p className="field__err" id={errId('city')}>
            {errors.city}
          </p>
        )}
      </div>

      <div className={errors.outlets ? 'field field--bad' : 'field'}>
        <label className="field__label" htmlFor={fieldId('outlets')}>
          How many outlets
        </label>
        <select
          id={fieldId('outlets')}
          name="outlets"
          value={form.outlets}
          onChange={(event) => set('outlets', event.target.value)}
          {...invalid('outlets')}
        >
          <option value="">Choose…</option>
          {OUTLETS.map((value) => (
            <option key={value} value={value}>
              {OUTLET_LABELS[value]}
            </option>
          ))}
        </select>
        {errors.outlets && (
          <p className="field__err" id={errId('outlets')}>
            {errors.outlets}
          </p>
        )}
      </div>

      <div className="field">
        <label className="field__label" htmlFor={fieldId('restaurantType')}>
          Kind of place <span className="field__opt">(optional)</span>
        </label>
        <select
          id={fieldId('restaurantType')}
          name="restaurantType"
          value={form.restaurantType}
          onChange={(event) => set('restaurantType', event.target.value)}
        >
          <option value="">Choose…</option>
          {RESTAURANT_TYPES.map((value) => (
            <option key={value} value={value}>
              {TYPE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div className={errors.email ? 'field field--bad' : 'field'}>
        <label className="field__label" htmlFor={fieldId('email')}>
          Email <span className="field__opt">(optional)</span>
        </label>
        <input
          id={fieldId('email')}
          name="email"
          type="email"
          autoComplete="email"
          value={form.email}
          onChange={(event) => set('email', event.target.value)}
          {...invalid('email')}
        />
        {errors.email && (
          <p className="field__err" id={errId('email')}>
            {errors.email}
          </p>
        )}
      </div>

      <div className="field">
        <label className="field__label" htmlFor={fieldId('preferredLanguage')}>
          Demo in <span className="field__opt">(optional)</span>
        </label>
        <select
          id={fieldId('preferredLanguage')}
          name="preferredLanguage"
          value={form.preferredLanguage}
          onChange={(event) => set('preferredLanguage', event.target.value)}
        >
          <option value="">Choose a language…</option>
          {LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {language.label}
            </option>
          ))}
        </select>
      </div>

      <div
        className={
          errors.message ? 'field field--full field--bad' : 'field field--full'
        }
      >
        <label className="field__label" htmlFor={fieldId('message')}>
          Anything we should know <span className="field__opt">(optional)</span>
        </label>
        <textarea
          id={fieldId('message')}
          name="message"
          maxLength={LIMITS.message.max}
          value={form.message}
          onChange={(event) => set('message', event.target.value)}
          placeholder="Which POS you use today, what's not working, best time to call…"
          {...invalid('message')}
        />
        {errors.message && (
          <p className="field__err" id={errId('message')}>
            {errors.message}
          </p>
        )}
      </div>

      {/* Honeypot. Off-screen rather than display:none so a bot that renders
          CSS still sees a fillable input; hidden from assistive tech and from
          the tab order so no human ever reaches it. */}
      <div className="hp" aria-hidden="true">
        <label htmlFor={fieldId('website')}>Website</label>
        <input
          id={fieldId('website')}
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form.website}
          onChange={(event) => set('website', event.target.value)}
        />
      </div>

      <div className={errors.consent ? 'consent consent--bad' : 'consent'}>
        <input
          id={fieldId('consent')}
          name="consent"
          type="checkbox"
          checked={form.consent}
          onChange={(event) => set('consent', event.target.checked)}
          {...invalid('consent')}
        />
        <label htmlFor={fieldId('consent')}>
          Yes, FoodOS.ai can contact me about this demo by phone, WhatsApp or
          email.
          {errors.consent && (
            <span className="field__err" id={errId('consent')}>
              {' '}
              {errors.consent}
            </span>
          )}
        </label>
      </div>

      <Turnstile onToken={setTurnstileToken} />
      {errors.turnstileToken && (
        <p className="field__err" id={errId('turnstileToken')} role="alert">
          {errors.turnstileToken}
        </p>
      )}

      <div className="form__actions">
        <button
          type="submit"
          className="btn btn--primary btn--lg"
          disabled={sending}
        >
          {sending && <span className="spin" aria-hidden="true" />}
          {sending ? 'Sending…' : 'Book my demo'}
        </button>
        <p className="form__fine">
          We only use this to call you about the demo.
        </p>
      </div>
    </form>
  )
}
