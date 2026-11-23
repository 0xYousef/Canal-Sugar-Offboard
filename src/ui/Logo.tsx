/** Brand mark. Two transparent versions; CSS shows the one that suits the current theme. */
export function Logo({ size = 36 }: { size?: number }) {
  const common = { width: size, height: size, alt: '', 'aria-hidden': true as const, decoding: 'async' as const }
  return (
    <span className="logo inline-flex shrink-0" style={{ width: size, height: size }}>
      <img src="/logo-light.png" className="logo-light" {...common} />
      <img src="/logo-dark.png" className="logo-dark" {...common} />
    </span>
  )
}
