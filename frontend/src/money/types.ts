export type MoneyBook = {
    schemaVersion: number
    id: string
    name: string
    primaryBalanceAccountId: string
    enabled: boolean
    viewerUsers: string[]
    createdAt: string
    updatedAt: string
}

export type MoneyItem = {
    id: string
    bookId: string
    name: string
    type: string
    enabled: boolean
    sort: number
    includeInReconcile: boolean
    includeInCash: boolean
    includeInInvestmentProfit: boolean
    includeInNetAsset: boolean
    includeInLiability: boolean
    note: string
}

export type ReconciliationEntry = {
    itemId: string
    itemNameSnapshot: string
    itemTypeSnapshot: string
    previousValueCents: number
    currentValueCents: number
    bookValueCents: number
    actualValueCents: number
    changeCents: number
    annualizedRate: number
    note: string
}

export type BalanceSuggestion = {
    id: string
    type: string
    fromItemId: string
    fromItemName: string
    toItemId: string
    toItemName: string
    bookValueCents: number
    actualValueCents: number
    diffCents: number
    message: string
}

export type MoneySummary = {
    cashCents: number
    netAssetCents: number
    liabilityCents: number
    totalAssetCents: number
    netAssetChangeCents: number
    investmentProfitCents: number
    netAssetLiabilityRate: number
    assetLiabilityRate: number
    positiveAssetCents: number
    unknownIncomeCents: number
    unknownExpenseCents: number
    calculationWarningMessages: string[]
}

export type MoneyEvent = {
    id: string
    date: string
    content: string
}

export type ReconciliationBatch = {
    schemaVersion: number
    id: string
    bookId: string
    date: string
    status: string
    intervalDays: number
    entries: ReconciliationEntry[]
    balanceSuggestions: BalanceSuggestion[]
    summary: MoneySummary
    events: MoneyEvent[]
    source: string
    sourceRef: string
    createdBy: string
    confirmedBy: string
    createdAt: string
    updatedAt: string
    confirmedAt: string
}

export type MoneyBatchIndexItem = {
    id: string
    bookId: string
    date: string
    status: string
    netAssetCents: number
    netAssetChangeCents: number
    investmentProfitCents: number
    assetLiabilityRate: number
    createdBy: string
    confirmedBy: string
    createdAt: string
    confirmedAt: string
    source: string
    sourceRef: string
}

export type MoneyDashboardTrendItem = {
    date: string
    cashCents: number
    netAssetCents: number
    liabilityCents: number
    totalAssetCents: number
    investmentProfitCents: number
    assetLiabilityRate: number
}

export type MoneyDashboardStructureItem = {
    name: string
    valueCents: number
}

export type MoneyDashboard = {
    book: MoneyBook
    latestBatchId: string
    latestDate: string
    summary: MoneySummary
    trends: MoneyDashboardTrendItem[]
    assetStructure: MoneyDashboardStructureItem[]
    liabilityStructure: MoneyDashboardStructureItem[]
    events: MoneyEvent[]
}

export type MoneyImportPreviewSheet = {
    sheetName: string
    date: string
    valid: boolean
    warnings: string[]
    summary: MoneySummary
    events: MoneyEvent[]
    rowsRead: number
}

export type MoneyImportPreview = {
    id: string
    bookId: string
    fileName: string
    sheets: MoneyImportPreviewSheet[]
    warnings: string[]
    createdAt: string
}

