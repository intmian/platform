export interface OutPutData {
    name: string,
    mainPic: string
    note: string
    // 主观评分
    subScore: ScoreData
    // 客观评分
    objScore: ScoreData
    // 创新评分
    innovateScore: ScoreData
    // 主评分
    mainScore: ScoreData
    comment: string
}

export interface ScoreData {
    value: number
    plus: boolean
    sub: boolean
    comment: string
}