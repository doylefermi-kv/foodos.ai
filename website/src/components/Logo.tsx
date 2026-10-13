/**
 * The FoodOS.ai mark: a torn thermal receipt with two bill lines, plus the
 * shop-board wordmark. The icon carries no type, so it survives at 16px — it
 * is the same path as the favicon in `public/favicon.svg`.
 */
export function Logo({ href = '#top' }: { href?: string }) {
  return (
    <a className="mark" href={href}>
      <span className="mark__ico">
        <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
          <path
            d="M8 6h16v18l-2.67 2-2.67-2-2.67 2-2.66-2-2.67 2-2.66-2z"
            fill="#FFB703"
          />
          <rect x="11" y="10.4" width="10" height="2.4" fill="#16130F" />
          <rect x="11" y="15" width="6.4" height="2.4" fill="#16130F" />
        </svg>
      </span>
      <span className="mark__wd">
        FoodOS<i>.ai</i>
      </span>
      <span className="visually-hidden">FoodOS.ai home</span>
    </a>
  )
}
