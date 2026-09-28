import logoDark from '../assets/logo-dark-bg.png'
import logoLight from '../assets/logo.png'

/**
 * `variant="light"` (default) is the black-lettered ArtBH mark for light backgrounds.
 * `variant="dark"` is the white-lettered version for dark backgrounds, where
 * black lettering would disappear.
 */
export function Logo({
  className = '',
  variant = 'light',
}: {
  className?: string
  variant?: 'light' | 'dark'
}) {
  return (
    <img
      src={variant === 'dark' ? logoDark : logoLight}
      alt="ArtBH"
      className={`h-14 w-auto ${className}`}
    />
  )
}
