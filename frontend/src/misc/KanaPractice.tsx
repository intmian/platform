import {useState, useCallback, useEffect, useMemo, useRef} from 'react';
import {Button, Card, Checkbox, Col, Modal, Row, Segmented, Slider, Space, Tag, Typography, message, InputNumber} from 'antd';
import {ReloadOutlined, EyeOutlined, RightOutlined, SettingOutlined} from '@ant-design/icons';
import {useIsMobile} from "../common/hooksv2";

const {Title, Text} = Typography;

// ================= 数据定义 =================

interface KanaItem {
    r: string;  // romaji
    h: string;  // hiragana
    k: string;  // katakana
}

// 完整数据源
const SEION: KanaItem[] = [
    {r: 'a', h: 'あ', k: 'ア'}, {r: 'i', h: 'い', k: 'イ'}, {r: 'u', h: 'う', k: 'ウ'}, {r: 'e', h: 'え', k: 'エ'}, {r: 'o', h: 'お', k: 'オ'},
    {r: 'ka', h: 'か', k: 'カ'}, {r: 'ki', h: 'き', k: 'キ'}, {r: 'ku', h: 'く', k: 'ク'}, {r: 'ke', h: 'け', k: 'ケ'}, {r: 'ko', h: 'こ', k: 'コ'},
    {r: 'sa', h: 'さ', k: 'サ'}, {r: 'shi', h: 'し', k: 'シ'}, {r: 'su', h: 'す', k: 'ス'}, {r: 'se', h: 'せ', k: 'セ'}, {r: 'so', h: 'そ', k: 'ソ'},
    {r: 'ta', h: 'た', k: 'タ'}, {r: 'chi', h: 'ち', k: 'チ'}, {r: 'tsu', h: 'つ', k: 'ツ'}, {r: 'te', h: 'て', k: 'テ'}, {r: 'to', h: 'と', k: 'ト'},
    {r: 'na', h: 'な', k: 'ナ'}, {r: 'ni', h: 'に', k: 'ニ'}, {r: 'nu', h: 'ぬ', k: 'ヌ'}, {r: 'ne', h: 'ね', k: 'ネ'}, {r: 'no', h: 'の', k: 'ノ'},
    {r: 'ha', h: 'は', k: 'ハ'}, {r: 'hi', h: 'ひ', k: 'ヒ'}, {r: 'fu', h: 'ふ', k: 'フ'}, {r: 'he', h: 'へ', k: 'ヘ'}, {r: 'ho', h: 'ほ', k: 'ホ'},
    {r: 'ma', h: 'ま', k: 'マ'}, {r: 'mi', h: 'み', k: 'ミ'}, {r: 'mu', h: 'む', k: 'ム'}, {r: 'me', h: 'め', k: 'メ'}, {r: 'mo', h: 'も', k: 'モ'},
    {r: 'ya', h: 'や', k: 'ヤ'}, {r: 'yu', h: 'ゆ', k: 'ユ'}, {r: 'yo', h: 'よ', k: 'ヨ'},
    {r: 'ra', h: 'ら', k: 'ラ'}, {r: 'ri', h: 'り', k: 'リ'}, {r: 'ru', h: 'る', k: 'ル'}, {r: 're', h: 'れ', k: 'レ'}, {r: 'ro', h: 'ろ', k: 'ロ'},
    {r: 'wa', h: 'わ', k: 'ワ'}, {r: 'wo', h: 'を', k: 'ヲ'}, {r: 'n', h: 'ん', k: 'ン'}
];

const DAKUON: KanaItem[] = [
    {r: 'ga', h: 'が', k: 'ガ'}, {r: 'gi', h: 'ぎ', k: 'ギ'}, {r: 'gu', h: 'ぐ', k: 'グ'}, {r: 'ge', h: 'げ', k: 'ゲ'}, {r: 'go', h: 'ご', k: 'ゴ'},
    {r: 'za', h: 'ざ', k: 'ザ'}, {r: 'ji', h: 'じ', k: 'ジ'}, {r: 'zu', h: 'ず', k: 'ズ'}, {r: 'ze', h: 'ぜ', k: 'ゼ'}, {r: 'zo', h: 'ぞ', k: 'ゾ'},
    {r: 'da', h: 'だ', k: 'ダ'}, {r: 'ji', h: 'ぢ', k: 'ヂ'}, {r: 'zu', h: 'づ', k: 'ヅ'}, {r: 'de', h: 'で', k: 'デ'}, {r: 'do', h: 'ど', k: 'ド'},
    {r: 'ba', h: 'ば', k: 'バ'}, {r: 'bi', h: 'び', k: 'ビ'}, {r: 'bu', h: 'ぶ', k: 'ブ'}, {r: 'be', h: 'べ', k: 'ベ'}, {r: 'bo', h: 'ぼ', k: 'ボ'},
    {r: 'pa', h: 'ぱ', k: 'パ'}, {r: 'pi', h: 'ぴ', k: 'ピ'}, {r: 'pu', h: 'ぷ', k: 'プ'}, {r: 'pe', h: 'ぺ', k: 'ペ'}, {r: 'po', h: 'ぽ', k: 'ポ'}
];

const YOUON: KanaItem[] = [
    {r: 'kya', h: 'きゃ', k: 'キャ'}, {r: 'kyu', h: 'きゅ', k: 'キュ'}, {r: 'kyo', h: 'きょ', k: 'キョ'},
    {r: 'sha', h: 'しゃ', k: 'シャ'}, {r: 'shu', h: 'しゅ', k: 'シュ'}, {r: 'sho', h: 'しょ', k: 'ショ'},
    {r: 'cha', h: 'ちゃ', k: 'チャ'}, {r: 'chu', h: 'ちゅ', k: 'チュ'}, {r: 'cho', h: 'ちょ', k: 'チョ'},
    {r: 'nya', h: 'にゃ', k: 'ニャ'}, {r: 'nyu', h: 'にゅ', k: 'ニュ'}, {r: 'nyo', h: 'にょ', k: 'ニョ'},
    {r: 'hya', h: 'ひゃ', k: 'ヒャ'}, {r: 'hyu', h: 'ひゅ', k: 'ヒュ'}, {r: 'hyo', h: 'ひょ', k: 'ヒョ'},
    {r: 'mya', h: 'みゃ', k: 'ミャ'}, {r: 'myu', h: 'みゅ', k: 'ミュ'}, {r: 'myo', h: 'みょ', k: 'ミョ'},
    {r: 'rya', h: 'りゃ', k: 'リャ'}, {r: 'ryu', h: 'りゅ', k: 'リュ'}, {r: 'ryo', h: 'りょ', k: 'リョ'},
    {r: 'gya', h: 'ぎゃ', k: 'ギャ'}, {r: 'gyu', h: 'ぎゅ', k: 'ギュ'}, {r: 'gyo', h: 'ぎょ', k: 'ギョ'},
    {r: 'ja', h: 'じゃ', k: 'ジャ'}, {r: 'ju', h: 'じゅ', k: 'ジュ'}, {r: 'jo', h: 'じょ', k: 'ジョ'},
    {r: 'bya', h: 'びゃ', k: 'ビャ'}, {r: 'byu', h: 'びゅ', k: 'ビュ'}, {r: 'byo', h: 'びょ', k: 'ビョ'},
    {r: 'pya', h: 'ぴゃ', k: 'ピャ'}, {r: 'pyu', h: 'ぴゅ', k: 'ピュ'}, {r: 'pyo', h: 'ぴょ', k: 'ピョ'}
];

// 控制类型定义
type KanaLimit = 'h' | 'k' | 'all';
type InputMode = 'memory' | 'keyboard';
type DirectionMode = 'mixed' | 'toRomaji' | 'toKana';

interface PracticeSettings {
    includeSeion: boolean;
    includeDakuon: boolean;
    includeYouon: boolean;
    kanaLimit: KanaLimit;
    inputMode: InputMode;
    directionMode: DirectionMode;
    batchSize: number;
}

const DEFAULT_SETTINGS: PracticeSettings = {
    includeSeion: true,
    includeDakuon: false,
    includeYouon: false,
    kanaLimit: 'all',
    inputMode: 'memory',
    directionMode: 'mixed',
    batchSize: 5
};

interface Question {
    id: number;
    item: KanaItem;
    displayType: 'h' | 'k' | 'r';
    questionText: string;
    answerText: string;
    isRetryItem?: boolean;
    // 键盘模式下的状态
    isAnswered?: boolean;
    isCorrect?: boolean;
}

interface BatchPattern {
    isToRomaji: boolean;
    kanaType: 'h' | 'k';
}

interface RetryState {
    items: KanaItem[];
    pattern: BatchPattern;
}

const getKanaItemKey = (item: KanaItem) => `${item.r}|${item.h}|${item.k}`;

const KanaPractice = () => {
    const isMobile = useIsMobile();
    
    useEffect(() => {
        document.title = '日语-假名练习';
    }, []);

    // ============ 设置与持久化 ============
    const [settings, setSettings] = useState<PracticeSettings>(() => {
        try {
            const saved = localStorage.getItem('kana_settings_v1');
            if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        } catch (e) {
            console.error(e);
        }
        return DEFAULT_SETTINGS;
    });

    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // 保存设置
    useEffect(() => {
        localStorage.setItem('kana_settings_v1', JSON.stringify(settings));
    }, [settings]);

    const updateSetting = <K extends keyof PracticeSettings>(key: K, value: PracticeSettings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    // ============ 运行状态 ============
    const [sessionCount, setSessionCount] = useState(0);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [showAnswer, setShowAnswer] = useState(false); // Memory mode only
    const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
    const [wrongQuestionIds, setWrongQuestionIds] = useState<Set<number>>(new Set());
    const [retryState, setRetryState] = useState<RetryState | null>(null);
    const [currentBatchPattern, setCurrentBatchPattern] = useState<BatchPattern | null>(null);
    const questionsRef = useRef<Question[]>(questions);
    const wrongQuestionIdsRef = useRef<Set<number>>(wrongQuestionIds);
    const retryStateRef = useRef<RetryState | null>(retryState);
    const currentBatchPatternRef = useRef<BatchPattern | null>(currentBatchPattern);

    questionsRef.current = questions;
    wrongQuestionIdsRef.current = wrongQuestionIds;
    retryStateRef.current = retryState;
    currentBatchPatternRef.current = currentBatchPattern;
    
    // 键盘模式专用状态
    const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);

    // 获取候选池
    const getCandidatePool = useCallback(() => {
        let list: KanaItem[] = [];
        if (settings.includeSeion) list = [...list, ...SEION];
        if (settings.includeDakuon) list = [...list, ...DAKUON];
        if (settings.includeYouon) list = [...list, ...YOUON];
        return list.length > 0 ? list : SEION;
    }, [settings.includeSeion, settings.includeDakuon, settings.includeYouon]);

    // 生成一组新题
    const generateBatch = useCallback((resetRetry = false) => {
        const pool = getCandidatePool();
        const size = settings.batchSize;

        const currentWrongItems = settings.inputMode === 'memory' && !resetRetry
            ? questionsRef.current
                .filter(q => wrongQuestionIdsRef.current.has(q.id))
                .map(q => q.item)
            : [];

        const hasCurrentMemoryRound = settings.inputMode === 'memory'
            && questionsRef.current.length > 0
            && currentBatchPatternRef.current !== null;

        const nextRetryState = currentWrongItems.length > 0 && currentBatchPatternRef.current
            ? {
                items: currentWrongItems,
                pattern: currentBatchPatternRef.current
            }
            : null;

        const activeRetryState = resetRetry ? null : (hasCurrentMemoryRound ? nextRetryState : retryStateRef.current);
        const retryKeySet = new Set((activeRetryState?.items || []).map(getKanaItemKey));

        const shuffled = [...pool];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        const retryItems = activeRetryState
            ? activeRetryState.items.filter(item => pool.some(poolItem => getKanaItemKey(poolItem) === getKanaItemKey(item)))
            : [];
        const extraItems = shuffled.filter(item => !retryKeySet.has(getKanaItemKey(item)));
        const finalSize = Math.min(pool.length, Math.max(size, retryItems.length));
        const selectedItems = [...retryItems, ...extraItems].slice(0, finalSize);

        let pattern: BatchPattern;
        if (activeRetryState) {
            pattern = activeRetryState.pattern;
        } else {
            const isToRomaji = settings.directionMode === 'mixed'
                ? Math.random() > 0.5
                : settings.directionMode === 'toRomaji';
            let kanaType: 'h' | 'k';
            if (settings.kanaLimit === 'all') {
                kanaType = Math.random() > 0.5 ? 'h' : 'k';
            } else {
                kanaType = settings.kanaLimit;
            }
            pattern = {isToRomaji, kanaType};
        }

        const newQuestions: Question[] = selectedItems.map((item, index) => {
            let displayType: 'h' | 'k' | 'r';
            let questionText = "";
            let answerText = "";
            
            if (pattern.isToRomaji) {
                // 题: 假名 -> 答: 罗马音
                displayType = pattern.kanaType;
                questionText = item[pattern.kanaType];
                answerText = item.r;
            } else {
                // 题: 罗马音 -> 答: 假名
                displayType = 'r';
                questionText = item.r;
                answerText = item[pattern.kanaType];
            }

            return {
                id: Date.now() + index,
                item,
                displayType,
                questionText,
                answerText,
                isRetryItem: retryKeySet.has(getKanaItemKey(item))
            };
        });

        questionsRef.current = newQuestions;
        currentBatchPatternRef.current = pattern;
        retryStateRef.current = nextRetryState;
        wrongQuestionIdsRef.current = new Set();
        setQuestions(newQuestions);
        setCurrentBatchPattern(pattern);
        setRetryState(nextRetryState);
        setShowAnswer(false);
        setRevealedIds(new Set());
        setWrongQuestionIds(new Set());
        setSessionCount(c => c + 1);
        setCurrentQuestionIdx(0);
    }, [getCandidatePool, settings.batchSize, settings.directionMode, settings.inputMode, settings.kanaLimit]);

    // 计算当前批次的提示文本
    const batchInstruction = useMemo(() => {
        if (questions.length === 0) return '';
        const q = questions[0];
        // 这里的逻辑基于 generateBatch 中是统一生成的
        if (q.displayType === 'r') {
            // 题目是罗马音，要求假名
            // 检查这一批的答案类型判定是平还是片
            // 我们可以检查 q.answerText 是平假名还是片假名
            // 简单的方法是看 q.answerText === q.item.h
            const isHiraganaTarget = q.answerText === q.item.h;
            return `请回答对应的${isHiraganaTarget ? '平假名 (Hiragana)' : '片假名 (Katakana)'}`;
        } else {
            // 题目是假名，要求罗马音
            const isHiraganaQuestion = q.displayType === 'h';
            return `请回答${isHiraganaQuestion ? '平假名' : '片假名'}对应的罗马音`;
        }
    }, [questions]);


    // 初始化
    useEffect(() => {
        if (sessionCount === 0) {
            generateBatch();
        }
    }, [sessionCount, generateBatch]);

    const toggleWrongQuestion = useCallback((id: number) => {
        const next = new Set(wrongQuestionIdsRef.current);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        wrongQuestionIdsRef.current = next;
        setWrongQuestionIds(next);
    }, []);

    const handleCardClick = (id: number) => {
        const isTemporarilyRevealed = revealedIds.has(id);

        if (showAnswer || isTemporarilyRevealed) {
            toggleWrongQuestion(id);
            return;
        }
        
        setRevealedIds(prev => new Set(prev).add(id));

        // 2秒后隐藏
        setTimeout(() => {
            setRevealedIds(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }, 2000);
    };

    // 键盘模式交互
    const handleKeyboardInput = (value: string) => {
        const q = questions[currentQuestionIdx];
        if (!q || q.isAnswered) return;

        const isCorrect = value === q.answerText;
        
        // 更新当前题目状态
        const newQuestions = [...questions];
        newQuestions[currentQuestionIdx] = {
            ...q,
            isAnswered: true,
            isCorrect
        };
        questionsRef.current = newQuestions;
        setQuestions(newQuestions);

        const checkFinish = () => {
             const correctCount = newQuestions.filter(q => q.isCorrect).length;
             const total = newQuestions.length;
             const rate = Math.round((correctCount / total) * 100);

             Modal.confirm({
                 title: '本组练习完成',
                 content: `正确率: ${rate}% (${correctCount}/${total})。`,
                 onOk: generateBatch,
                 okText: '好的',
                 cancelButtonProps: { style: { display: 'none' } }
             });
        };

        if (isCorrect) {
            message.success('正解！');
            // 延迟切换下一题
            setTimeout(() => {
                 if (currentQuestionIdx < questions.length - 1) {
                    setCurrentQuestionIdx(prev => prev + 1);
                 } else {
                     checkFinish();
                 }
            }, 500);
        } else {
            message.error(`错误，正确答案是: ${q.answerText}`);
            // 答错也切下一题
             setTimeout(() => {
                 if (currentQuestionIdx < questions.length - 1) {
                    setCurrentQuestionIdx(prev => prev + 1);
                 } else {
                     checkFinish();
                 }
            }, 1500);
        }
    };

    // 渲染键盘
    const renderKeyboard = () => {
        const q = questions[currentQuestionIdx];
        if (!q) return null;

        const pool = getCandidatePool();
        const isAnswerRomaji = q.displayType !== 'r'; // 题是假名，答Romaji
        const uniqueKeys = new Set<string>();
        const keyboardItems: {display: string, value: string}[] = [];

        pool.forEach(item => {
            if (isAnswerRomaji) {
                if (!uniqueKeys.has(item.r)) {
                    uniqueKeys.add(item.r);
                    keyboardItems.push({display: item.r, value: item.r});
                }
            } else {
                // 检测这一题答案是平还是片
                const isHiraganaAnswer = q.item.h === q.answerText;
                const val = isHiraganaAnswer ? item.h : item.k;
                if (!uniqueKeys.has(val)) {
                    uniqueKeys.add(val);
                    keyboardItems.push({display: val, value: val});
                }
            }
        });

        return (
            <div style={{
                marginTop: 16,
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: '12px',
                background: '#fff',
                borderRadius: 8,
                border: '1px solid #f0f0f0',
                boxSizing: 'border-box'
            }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${isMobile ? 5 : 10}, minmax(0, 1fr))`,
                    gap: 8,
                    alignItems: 'stretch'
                }}>
                    {keyboardItems.map(k => (
                        <Button 
                            key={k.display} 
                            style={{
                                width: '100%',
                                height: isMobile ? 64 : 56,
                                fontSize: isMobile ? 18 : 16,
                                padding: 0,
                                lineHeight: 1
                            }}
                            onClick={() => handleKeyboardInput(k.value)}
                            disabled={q.isAnswered}
                        >
                            {k.display}
                        </Button>
                    ))}
                </div>
            </div>
        );
    };

    // 渲染主内容
    const renderContent = () => {
        if (settings.inputMode === 'memory') {
            return (
                <div style={{ height: '100%', overflowY: 'visible', paddingBottom: 20 }}>
                    <Row gutter={[16, 24]}>
                        {questions.map((q, idx) => {
                            const isRevealed = showAnswer || revealedIds.has(q.id);
                            const isMarkedWrong = wrongQuestionIds.has(q.id);
                            const isRetryItem = Boolean(q.isRetryItem);
                            return (
                                <Col span={isMobile ? 12 : 6} key={q.id}>
                                    <Card 
                                        hoverable={!showAnswer}
                                        onClick={() => handleCardClick(q.id)}
                                        style={{
                                            height: '100%',
                                            textAlign: 'center',
                                            cursor: 'pointer',
                                            borderColor: isMarkedWrong ? '#ff4d4f' : undefined,
                                            borderWidth: isMarkedWrong ? 2 : undefined,
                                            background: isRetryItem ? '#fffbe6' : undefined
                                        }}
                                        bodyStyle={{ padding: isMobile ? 12 : 24 }}
                                    >
                                        <div style={{ minHeight: 24, marginBottom: 8 }}>
                                            {isMarkedWrong && <Tag color="error">错题</Tag>}
                                            {!isMarkedWrong && isRetryItem && <Tag color="gold">错题续练</Tag>}
                                        </div>
                                        <div style={{ fontSize: 32, fontWeight: 'bold', margin: '16px 0' }}>
                                            {q.questionText}
                                        </div>
                                        <div style={{ minHeight: 40, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                                            {isRevealed ? (
                                                <Text strong style={{ fontSize: 24, color: '#1890ff' }}>{q.answerText}</Text>
                                            ) : (
                                                <Text type="secondary">?</Text>
                                            )}
                                        </div>
                                    </Card>
                                </Col>
                            );
                        })}
                    </Row>
                </div>
            );
        } else {
            // Keyboard Mode
            const q = questions[currentQuestionIdx];
            if (!q) return <div style={{textAlign: 'center', padding: 20}}>Loading...</div>;
            
            return (
                <div style={{ 
                    maxWidth: 600, 
                    margin: '0 auto', 
                    width: '100%', 
                    height: '100%',
                    display: 'flex', 
                    flexDirection: 'column'
                }}>
                    <div style={{ marginBottom: 16 }}>
                        <Card style={{ textAlign: 'center' }}>
                            <div style={{marginBottom: 8}}>
                                <Tag>进度: {currentQuestionIdx + 1} / {questions.length}</Tag>
                            </div>
                            <div style={{ fontSize: 64, fontWeight: 'bold', margin: '24px 0' }}>
                                {q.questionText}
                            </div>
                            {q.isAnswered && (
                                <div style={{color: q.isCorrect ? '#52c41a' : '#ff4d4f', fontSize: 20, fontWeight: 'bold'}}>
                                    {q.isCorrect ? '正解!' : `错啦! 答案: ${q.answerText}`}
                                </div>
                            )}
                        </Card>
                    </div>
                    
                    {renderKeyboard()}
                </div>
            );
        }
    };

    return (
        <div style={{
            padding: isMobile ? '12px' : '24px',
            maxWidth: 1000,
            margin: '0 auto',
            minHeight: '100vh',
            background: '#f0f2f5' 
        }}>
            {/* 顶部栏 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Title level={4} style={{ margin: 0, whiteSpace: 'nowrap', fontSize: isMobile ? 18 : undefined }}>
                    {isMobile ? '假名练习' : '🇯🇵 假名练习'}
                </Title>
                <Space size={isMobile ? 'small' : 'middle'}>
                    {settings.inputMode === 'memory' && (
                        <Button onClick={() => setShowAnswer(!showAnswer)} icon={showAnswer ? <ReloadOutlined/> : <EyeOutlined/>}>
                            {!isMobile && (showAnswer ? '隐藏' : '看答案')}
                        </Button>
                    )}
                    <Button onClick={() => generateBatch()} icon={<RightOutlined/>}>
                        {!isMobile && '换一组'}
                    </Button>
                    <Button icon={<SettingOutlined />} onClick={() => setIsSettingsOpen(true)}>
                        {!isMobile && '设置'}
                    </Button>
                </Space>
            </div>
            
            {/* 整体提示 */}
            {questions.length > 0 && (
                <div style={{ 
                    textAlign: 'center', 
                    marginBottom: 16, 
                    padding: '8px', 
                    background: '#e6f7ff', 
                    borderRadius: 8, 
                    border: '1px solid #91d5ff',
                    color: '#0050b3'
                }}>
                    <Text strong style={{fontSize: 16}}>{batchInstruction}</Text>
                    {settings.inputMode === 'memory' && (
                        <div style={{ marginTop: 8 }}>
                            <Text type="secondary">点卡片可临时查看答案；答案显示时再次点击可切换错题标记，红框表示当前轮错题。</Text>
                        </div>
                    )}
                    {settings.inputMode === 'memory' && retryState?.items.length ? (
                        <div style={{ marginTop: 8 }}>
                            <Tag color="gold">错题续练中: {retryState.items.length} 题</Tag>
                        </div>
                    ) : null}
                </div>
            )}

            {renderContent()}

            {/* 设置弹窗 */}
            <Modal
                title="练习设置"
                open={isSettingsOpen}
                onCancel={() => setIsSettingsOpen(false)}
                footer={[
                    <Button key="ok" type="primary" onClick={() => {
                        setIsSettingsOpen(false);
                        generateBatch(true); // 改设置时重置错题续练
                    }}>
                        确认并刷新
                    </Button>
                ]}
            >
                 <Space direction="vertical" style={{ width: '100%' }} size="large">
                    <div>
                        <Text strong>模式</Text>
                        <div style={{marginTop: 8}}>
                            <Segmented 
                                options={[
                                    { label: '记忆卡片', value: 'memory' },
                                    { label: '点选练习', value: 'keyboard' }
                                ]}
                                value={settings.inputMode}
                                onChange={v => updateSetting('inputMode', v as InputMode)}
                                block
                            />
                        </div>
                    </div>
                    
                    <div>
                        <Text strong>出题方向</Text>
                        <div style={{marginTop: 8}}>
                            <Segmented
                                options={[
                                    { label: '混合', value: 'mixed' },
                                    { label: '假名猜读音', value: 'toRomaji' },
                                    { label: '读音猜假名', value: 'toKana' }
                                ]}
                                value={settings.directionMode}
                                onChange={v => updateSetting('directionMode', v as DirectionMode)}
                                block
                            />
                        </div>
                    </div>

                    <div>
                        <Text strong>假名类型</Text>
                        <div style={{marginTop: 8}}>
                            <Segmented 
                                options={[
                                    { label: '混合 (All)', value: 'all' },
                                    { label: '平假名 (Hiragana)', value: 'h' },
                                    { label: '片假名 (Katakana)', value: 'k' }
                                ]}
                                value={settings.kanaLimit}
                                onChange={v => updateSetting('kanaLimit', v as KanaLimit)}
                                block
                            />
                        </div>
                    </div>
                    
                    <div>
                         <Text strong>范围设置</Text>
                         <div style={{marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap'}}>
                             <Checkbox 
                                checked={settings.includeSeion} 
                                onChange={e => updateSetting('includeSeion', e.target.checked)}
                            >
                                清音 (46)
                            </Checkbox>
                            <Checkbox 
                                checked={settings.includeDakuon} 
                                onChange={e => updateSetting('includeDakuon', e.target.checked)}
                            >
                                浊音 (25)
                            </Checkbox>
                            <Checkbox 
                                checked={settings.includeYouon} 
                                onChange={e => updateSetting('includeYouon', e.target.checked)}
                            >
                                拗音 (33)
                            </Checkbox>
                         </div>
                    </div>

                    <div>
                        <Text strong>每组数量: {settings.batchSize}</Text>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <Slider 
                                min={1} 
                                max={50} 
                                style={{ flex: 1 }}
                                value={settings.batchSize} 
                                onChange={v => updateSetting('batchSize', v)} 
                            />
                            <InputNumber
                                min={1}
                                max={50}
                                value={settings.batchSize}
                                onChange={v => updateSetting('batchSize', v || 5)}
                            />
                        </div>
                    </div>
                 </Space>
            </Modal>
        </div>
    );
};

export default KanaPractice;
