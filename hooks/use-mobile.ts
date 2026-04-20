import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const checkMobile = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", checkMobile)
    
    // Initial check - using setTimeout to avoid "cascading renders" lint error
    const timer = setTimeout(checkMobile, 0)
    
    return () => {
      mql.removeEventListener("change", checkMobile)
      clearTimeout(timer)
    }
  }, [])

  return !!isMobile
}
