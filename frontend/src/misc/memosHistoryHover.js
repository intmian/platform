export function shouldShowMemosHistoryHover({isMobile, popoverOpen}) {
    return !isMobile && !popoverOpen;
}
