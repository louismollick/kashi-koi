import { withSentences } from '../src/lyrics/sentences';
import type { Line, ReviewList, Song as LibrarySong, SongLyrics } from '@/types/domain';

type Song = Omit<LibrarySong, 'lyricsStatus'> & {
  color: string;
  accent: string;
  rank: string | null;
  lines: Line[];
  hasLyrics: boolean;
};
type Album = Pick<Song, 'id' | 'title' | 'artist' | 'artistId' | 'color' | 'accent'> & { year: number };
type Artist = Pick<Song, 'id' | 'color' | 'accent'> & { name: string };
const lyrics = {
  dawn: [
    {
      segments: [
        { text: '夜', reading: 'よ' },
        { text: '明', reading: 'あ' },
        { text: 'けのバスに' },
        { text: '揺', reading: 'ゆ' },
        { text: 'られて' },
      ],
      translation: 'Swaying on the dawn bus',
    },
    {
      segments: [
        { text: '窓', reading: 'まど' },
        { text: 'に' },
        { text: '映', reading: 'うつ' },
        { text: 'る' },
        { text: '君', reading: 'きみ' },
        { text: 'の' },
        { text: '面', reading: 'おも' },
        { text: '影', reading: 'かげ' },
      ],
      translation: 'Your face reflected in the window',
    },
    {
      segments: [
        { text: '言', reading: 'い' },
        { text: 'えなかった' },
        { text: '言', reading: 'こと' },
        { text: '葉', reading: 'ば' },
        { text: 'が ' },
        { text: '胸', reading: 'むね' },
        { text: 'の' },
        { text: '奥', reading: 'おく' },
        { text: 'で' },
        { text: '眠', reading: 'ねむ' },
        { text: 'ってる' },
      ],
      translation: 'Unsaid words sleep in my chest',
    },
    {
      segments: [
        { text: '遠', reading: 'とお' },
        { text: 'ざかる' },
        { text: '街', reading: 'まち' },
        { text: 'の' },
        { text: '灯', reading: 'あか' },
        { text: 'りを ひとつずつ' },
        { text: '数', reading: 'かぞ' },
        { text: 'えてた' },
      ],
      translation: 'Counting the fading town lights',
    },
    {
      segments: [
        { text: '「さよなら」なんて ' },
        { text: '似', reading: 'に' },
        { text: '合', reading: 'あ' },
        { text: 'わないよ' },
      ],
      translation: 'Goodbye never suited us',
    },
    {
      segments: [
        { text: '次', reading: 'つぎ' },
        { text: 'の' },
        { text: '停', reading: 'てい' },
        { text: '留', reading: 'りゅう' },
        { text: '所', reading: 'じょ' },
        { text: 'で ' },
        { text: '降', reading: 'お' },
        { text: 'りるつもりだった' },
      ],
      translation: 'I meant to get off at the next stop',
    },
    {
      segments: [
        { text: 'ガラス' },
        { text: '越', reading: 'ご' },
        { text: 'しに ' },
        { text: '君', reading: 'きみ' },
        { text: 'が' },
        { text: '笑', reading: 'わら' },
        { text: 'った' },
        { text: '気', reading: 'き' },
        { text: 'がした' },
      ],
      translation: 'I thought you smiled through the glass',
    },
    {
      segments: [
        { text: '空', reading: 'から' },
        { text: 'の' },
        { text: '座', reading: 'ざ' },
        { text: '席', reading: 'せき' },
        { text: 'に ' },
        { text: '朝', reading: 'あさ' },
        { text: 'の' },
        { text: '光', reading: 'ひかり' },
        { text: 'が' },
        { text: '差', reading: 'さ' },
        { text: 'した' },
      ],
      translation: 'Morning light fell on the empty seat',
    },
    {
      segments: [
        { text: 'エンジンの' },
        { text: '音', reading: 'おと' },
        { text: 'だけ ' },
        { text: '聞', reading: 'き' },
        { text: 'いていた' },
      ],
      translation: 'All I heard was the engine',
    },
    {
      segments: [
        { text: '朝', reading: 'あさ' },
        { text: '焼', reading: 'や' },
        { text: 'けが' },
        { text: '空', reading: 'そら' },
        { text: 'を' },
        { text: '染', reading: 'そ' },
        { text: 'めていく' },
      ],
      translation: 'The sunrise colors the sky',
    },
    {
      segments: [
        { text: '名', reading: 'な' },
        { text: '前', reading: 'まえ' },
        { text: 'を' },
        { text: '呼', reading: 'よ' },
        { text: 'んでも ' },
        { text: '届', reading: 'とど' },
        { text: 'かない' },
      ],
      translation: 'Calling your name cannot reach you',
    },
    {
      segments: [
        { text: 'この' },
        { text: '道', reading: 'みち' },
        { text: 'は どこまで' },
        { text: '続', reading: 'つづ' },
        { text: 'くの' },
      ],
      translation: 'How far does this road go?',
    },
    {
      segments: [
        { text: 'もう' },
        { text: '一', reading: 'いち' },
        { text: '度', reading: 'ど' },
        { text: 'だけ ' },
        { text: '会', reading: 'あ' },
        { text: 'いたかった' },
      ],
      translation: 'I wanted to see you one more time',
    },
    {
      segments: [
        { text: '夜', reading: 'よ' },
        { text: '明', reading: 'あ' },
        { text: 'けのバスは ' },
        { text: '走', reading: 'はし' },
        { text: 'っていく' },
      ],
      translation: 'The dawn bus keeps going',
    },
  ],
  glass: [
    {
      segments: [
        { text: '硝', reading: 'が' },
        { text: '子', reading: 'らす' },
        { text: 'の' },
        { text: '街', reading: 'まち' },
        { text: 'に ' },
        { text: '夜', reading: 'よる' },
        { text: 'が' },
        { text: '降', reading: 'ふ' },
        { text: 'る' },
      ],
      translation: 'Night falls on the glass town',
    },
    {
      segments: [
        { text: '窓', reading: 'まど' },
        { text: 'の' },
        { text: '向', reading: 'む' },
        { text: 'こうで ' },
        { text: '星', reading: 'ほし' },
        { text: 'が' },
        { text: '揺', reading: 'ゆ' },
        { text: 'れる' },
      ],
      translation: 'Stars sway beyond the window',
    },
    {
      segments: [
        { text: '青', reading: 'あお' },
        { text: 'い' },
        { text: '信', reading: 'しん' },
        { text: '号', reading: 'ごう' },
        { text: 'を ' },
        { text: '待', reading: 'ま' },
        { text: 'っていた' },
      ],
      translation: 'I was waiting for the green light',
    },
    {
      segments: [
        { text: '透', reading: 'す' },
        { text: 'き' },
        { text: '通', reading: 'とお' },
        { text: 'る' },
        { text: '声', reading: 'こえ' },
        { text: 'が ' },
        { text: '路', reading: 'ろ' },
        { text: '地', reading: 'じ' },
        { text: 'に' },
        { text: '響', reading: 'ひび' },
        { text: 'く' },
      ],
      translation: 'A clear voice echoes in the alley',
    },
    {
      segments: [
        { text: '靴', reading: 'くつ' },
        { text: 'の' },
        { text: '音', reading: 'おと' },
        { text: 'だけ ' },
        { text: '追', reading: 'お' },
        { text: 'いかけて' },
      ],
      translation: 'Following only the sound of footsteps',
    },
    {
      segments: [
        { text: '指', reading: 'ゆび' },
        { text: 'でなぞった ' },
        { text: '曇', reading: 'くも' },
        { text: 'りガラス' },
      ],
      translation: 'Tracing the fogged glass with a finger',
    },
    {
      segments: [
        { text: '消', reading: 'き' },
        { text: 'えかけた' },
        { text: '文', reading: 'も' },
        { text: '字', reading: 'じ' },
        { text: 'に ' },
        { text: '君', reading: 'きみ' },
        { text: 'を' },
        { text: '探', reading: 'さが' },
        { text: 'す' },
      ],
      translation: 'Looking for you in fading letters',
    },
    {
      segments: [
        { text: '白', reading: 'しろ' },
        { text: 'い' },
        { text: '息', reading: 'いき' },
        { text: 'が ' },
        { text: '空', reading: 'そら' },
        { text: 'にほどける' },
      ],
      translation: 'White breath unravels into the sky',
    },
    {
      segments: [
        { text: '帰', reading: 'かえ' },
        { text: 'り' },
        { text: '道', reading: 'みち' },
        { text: 'には ' },
        { text: '月', reading: 'つき' },
        { text: 'がいた' },
      ],
      translation: 'The moon was there on the way home',
    },
    {
      segments: [
        { text: '橋', reading: 'はし' },
        { text: 'の' },
        { text: '上', reading: 'うえ' },
        { text: 'から ' },
        { text: '街', reading: 'まち' },
        { text: 'を' },
        { text: '見', reading: 'み' },
        { text: 'ていた' },
      ],
      translation: 'Watching the town from the bridge',
    },
    {
      segments: [
        { text: '割', reading: 'わ' },
        { text: 'れない' },
        { text: '夢', reading: 'ゆめ' },
        { text: 'を ' },
        { text: '抱', reading: 'だ' },
        { text: 'いていた' },
      ],
      translation: 'Holding a dream that would not break',
    },
    {
      segments: [
        { text: '硝', reading: 'が' },
        { text: '子', reading: 'らす' },
        { text: 'の' },
        { text: '街', reading: 'まち' },
        { text: 'は ' },
        { text: '眠', reading: 'ねむ' },
        { text: 'らない' },
      ],
      translation: 'The glass town never sleeps',
    },
  ],
  rain: [
    {
      segments: [
        { text: '雨', reading: 'あめ' },
        { text: '宿', reading: 'やど' },
        { text: 'りした ' },
        { text: '古', reading: 'ふる' },
        { text: 'い' },
        { text: '店', reading: 'みせ' },
        { text: 'で' },
      ],
      translation: 'Taking shelter in an old shop',
    },
    {
      segments: [
        { text: '濡', reading: 'ぬ' },
        { text: 'れた' },
        { text: '袖', reading: 'そで' },
        { text: 'から ' },
        { text: '雫', reading: 'しずく' },
        { text: 'が' },
        { text: '落', reading: 'お' },
        { text: 'ちる' },
      ],
      translation: 'Drops fall from wet sleeves',
    },
    {
      segments: [
        { text: '遠', reading: 'とお' },
        { text: 'い' },
        { text: '雷', reading: 'かみなり' },
        { text: 'が ' },
        { text: '空', reading: 'そら' },
        { text: 'を' },
        { text: '鳴', reading: 'な' },
        { text: 'らす' },
      ],
      translation: 'Distant thunder rings through the sky',
    },
    {
      segments: [
        { text: '言', reading: 'こと' },
        { text: '葉', reading: 'ば' },
        { text: 'の' },
        { text: '代', reading: 'か' },
        { text: 'わりに ' },
        { text: '雨', reading: 'あめ' },
        { text: 'を' },
        { text: '聞', reading: 'き' },
        { text: 'いた' },
      ],
      translation: 'Listening to rain instead of words',
    },
    {
      segments: [
        { text: '冷', reading: 'つめ' },
        { text: 'たい' },
        { text: '指', reading: 'ゆび' },
        { text: 'を そっと' },
        { text: '隠', reading: 'かく' },
        { text: 'す' },
      ],
      translation: 'Quietly hiding cold fingers',
    },
    {
      segments: [
        { text: '軒', reading: 'のき' },
        { text: '先', reading: 'さき' },
        { text: 'の' },
        { text: '花', reading: 'はな' },
        { text: 'が ' },
        { text: '風', reading: 'かぜ' },
        { text: 'に' },
        { text: '揺', reading: 'ゆ' },
        { text: 'れる' },
      ],
      translation: 'Flowers under the eaves sway in the wind',
    },
    {
      segments: [
        { text: '止', reading: 'や' },
        { text: 'まない' },
        { text: '雨', reading: 'あめ' },
        { text: 'を ' },
        { text: '待', reading: 'ま' },
        { text: 'っていた' },
      ],
      translation: 'Waiting for the endless rain',
    },
    {
      segments: [
        { text: '傘', reading: 'かさ' },
        { text: 'の' },
        { text: '下', reading: 'した' },
        { text: 'で ' },
        { text: '君', reading: 'きみ' },
        { text: 'は' },
        { text: '何', reading: 'なに' },
        { text: 'も' },
        { text: '言', reading: 'い' },
        { text: 'わなかった' },
      ],
      translation: 'Under the umbrella, you said nothing',
    },
    {
      segments: [
        { text: '雨', reading: 'あめ' },
        { text: 'の' },
        { text: '音', reading: 'おと' },
        { text: 'だけ ' },
        { text: '聞', reading: 'き' },
        { text: 'いていた' },
      ],
      translation: 'All I heard was the sound of rain',
    },
    {
      segments: [
        { text: '水', reading: 'みず' },
        { text: 'たまりには ' },
        { text: '空', reading: 'そら' },
        { text: 'が' },
        { text: '映', reading: 'うつ' },
        { text: 'る' },
      ],
      translation: 'The sky is reflected in a puddle',
    },
    {
      segments: [
        { text: '雲', reading: 'くも' },
        { text: 'の' },
        { text: '切', reading: 'き' },
        { text: 'れ' },
        { text: '間', reading: 'ま' },
        { text: 'を ' },
        { text: '見', reading: 'み' },
        { text: 'つめていた' },
      ],
      translation: 'Watching a break in the clouds',
    },
    {
      segments: [
        { text: '雨', reading: 'あめ' },
        { text: '上', reading: 'あ' },
        { text: 'がりには また' },
        { text: '歩', reading: 'ある' },
        { text: 'こう' },
      ],
      translation: 'Let us walk again after the rain',
    },
  ],
  dream: [
    {
      segments: [
        { text: '白', reading: 'はく' },
        { text: '昼', reading: 'ちゅう' },
        { text: '夢', reading: 'む' },
        { text: 'の' },
        { text: '中', reading: 'なか' },
        { text: 'で ' },
        { text: '目', reading: 'め' },
        { text: 'を' },
        { text: '開', reading: 'あ' },
        { text: 'けた' },
      ],
      translation: 'Opening my eyes inside a daydream',
    },
    {
      segments: [
        { text: '午', reading: 'ご' },
        { text: '後', reading: 'ご' },
        { text: 'の' },
        { text: '光', reading: 'ひかり' },
        { text: 'が ' },
        { text: '頬', reading: 'ほお' },
        { text: 'に' },
        { text: '触', reading: 'ふ' },
        { text: 'れる' },
      ],
      translation: 'Afternoon light touches my cheek',
    },
    {
      segments: [
        { text: '机', reading: 'つくえ' },
        { text: 'の' },
        { text: '上', reading: 'うえ' },
        { text: 'には ' },
        { text: '書', reading: 'か' },
        { text: 'きかけの' },
        { text: '手', reading: 'て' },
        { text: '紙', reading: 'がみ' },
      ],
      translation: 'An unfinished letter on the desk',
    },
    {
      segments: [
        { text: '時', reading: 'と' },
        { text: '計', reading: 'けい' },
        { text: 'の' },
        { text: '針', reading: 'はり' },
        { text: 'だけ ' },
        { text: '先', reading: 'さき' },
        { text: 'に' },
        { text: '進', reading: 'すす' },
        { text: 'む' },
      ],
      translation: 'Only the clock hands move ahead',
    },
    {
      segments: [
        { text: '目', reading: 'め' },
        { text: 'を' },
        { text: '閉', reading: 'と' },
        { text: 'じたまま ' },
        { text: '君', reading: 'きみ' },
        { text: 'を' },
        { text: '描', reading: 'えが' },
        { text: 'く' },
      ],
      translation: 'Picturing you with my eyes closed',
    },
    {
      segments: [{ text: '風', reading: 'かぜ' }, { text: 'がページを めくっていく' }],
      translation: 'The wind turns the pages',
    },
    {
      segments: [
        { text: '名', reading: 'な' },
        { text: '前', reading: 'まえ' },
        { text: 'のない' },
        { text: '夢', reading: 'ゆめ' },
        { text: 'を ' },
        { text: '追', reading: 'お' },
        { text: 'いかけた' },
      ],
      translation: 'Chasing a dream without a name',
    },
    {
      segments: [
        { text: '雲', reading: 'くも' },
        { text: 'の' },
        { text: '影', reading: 'かげ' },
        { text: 'だけ ' },
        { text: '部', reading: 'へ' },
        { text: '屋', reading: 'や' },
        { text: 'を' },
        { text: '渡', reading: 'わた' },
        { text: 'る' },
      ],
      translation: 'Only cloud shadows cross the room',
    },
    {
      segments: [
        { text: '眠', reading: 'ねむ' },
        { text: 'れないまま ' },
        { text: '朝', reading: 'あさ' },
        { text: 'を' },
        { text: '待', reading: 'ま' },
        { text: 'つ' },
      ],
      translation: 'Waiting for morning without sleep',
    },
    {
      segments: [
        { text: '遠', reading: 'とお' },
        { text: 'い' },
        { text: '記', reading: 'き' },
        { text: '憶', reading: 'おく' },
        { text: 'に ' },
        { text: '手', reading: 'て' },
        { text: 'を' },
        { text: '伸', reading: 'の' },
        { text: 'ばす' },
      ],
      translation: 'Reaching toward a distant memory',
    },
    {
      segments: [
        { text: '夢', reading: 'ゆめ' },
        { text: 'の' },
        { text: '続', reading: 'つづ' },
        { text: 'きは ここにある' },
      ],
      translation: 'The rest of the dream is here',
    },
    {
      segments: [
        { text: '白', reading: 'はく' },
        { text: '昼', reading: 'ちゅう' },
        { text: '夢', reading: 'む' },
        { text: 'から ' },
        { text: '帰', reading: 'かえ' },
        { text: 'ってきた' },
      ],
      translation: 'Returning from a daydream',
    },
  ],
  bluebird: [
    {
      segments: [
        { text: '青', reading: 'あお' },
        { text: 'い' },
        { text: '鳥', reading: 'とり' },
        { text: 'が ' },
        { text: '朝', reading: 'あさ' },
        { text: 'を' },
        { text: '運', reading: 'はこ' },
        { text: 'ぶ' },
      ],
      translation: 'A blue bird carries the morning',
    },
    {
      segments: [
        { text: '羽', reading: 'はね' },
        { text: 'の' },
        { text: '音', reading: 'おと' },
        { text: 'に ' },
        { text: '耳', reading: 'みみ' },
        { text: 'をすませた' },
      ],
      translation: 'Listening closely to the wings',
    },
    {
      segments: [
        { text: '枝', reading: 'えだ' },
        { text: 'の' },
        { text: '上', reading: 'うえ' },
        { text: 'には ' },
        { text: '小', reading: 'ちい' },
        { text: 'さな' },
        { text: '歌', reading: 'うた' },
      ],
      translation: 'A little song on the branch',
    },
    {
      segments: [
        { text: '高', reading: 'たか' },
        { text: 'い' },
        { text: '空', reading: 'そら' },
        { text: 'へと ' },
        { text: '飛', reading: 'と' },
        { text: 'んでいこう' },
      ],
      translation: 'Let us fly into the high sky',
    },
    {
      segments: [
        { text: '風', reading: 'かぜ' },
        { text: 'の' },
        { text: '行', reading: 'ゆ' },
        { text: 'く' },
        { text: '先', reading: 'さき' },
        { text: 'を ' },
        { text: '知', reading: 'し' },
        { text: 'りたかった' },
      ],
      translation: 'Wanting to know where the wind goes',
    },
    {
      segments: [
        { text: '青', reading: 'あお' },
        { text: 'い' },
        { text: '羽', reading: 'はね' },
        { text: 'だけ ' },
        { text: '光', reading: 'ひか' },
        { text: 'っていた' },
      ],
      translation: 'Only the blue feathers were shining',
    },
    {
      segments: [
        { text: '窓', reading: 'まど' },
        { text: 'を' },
        { text: '開', reading: 'あ' },
        { text: 'けたら ' },
        { text: '春', reading: 'はる' },
        { text: 'がいた' },
      ],
      translation: 'Spring was there when I opened the window',
    },
    {
      segments: [
        { text: '小', reading: 'ちい' },
        { text: 'さな' },
        { text: '影', reading: 'かげ' },
        { text: 'が ' },
        { text: '庭', reading: 'にわ' },
        { text: 'を' },
        { text: '渡', reading: 'わた' },
        { text: 'る' },
      ],
      translation: 'A little shadow crosses the garden',
    },
    {
      segments: [
        { text: '歌', reading: 'うた' },
        { text: 'の' },
        { text: '続', reading: 'つづ' },
        { text: 'きを ' },
        { text: '教', reading: 'おし' },
        { text: 'えてよ' },
      ],
      translation: 'Tell me the rest of the song',
    },
    {
      segments: [
        { text: '雲', reading: 'くも' },
        { text: 'の' },
        { text: '向', reading: 'む' },
        { text: 'こうに ' },
        { text: '道', reading: 'みち' },
        { text: 'がある' },
      ],
      translation: 'There is a path beyond the clouds',
    },
    {
      segments: [
        { text: '帰', reading: 'かえ' },
        { text: 'る' },
        { text: '場', reading: 'ば' },
        { text: '所', reading: 'しょ' },
        { text: 'なら ここにある' },
      ],
      translation: 'Your place to return is here',
    },
    {
      segments: [
        { text: '青', reading: 'あお' },
        { text: 'い' },
        { text: '鳥', reading: 'とり' },
        { text: 'は また' },
        { text: '歌', reading: 'うた' },
        { text: 'う' },
      ],
      translation: 'The blue bird sings again',
    },
  ],
  summer: [
    {
      segments: [
        { text: '夏', reading: 'なつ' },
        { text: '草', reading: 'くさ' },
        { text: 'の' },
        { text: '線', reading: 'せん' },
        { text: '路', reading: 'ろ' },
        { text: 'を ' },
        { text: '歩', reading: 'ある' },
        { text: 'いていた' },
      ],
      translation: 'Walking along the grassy summer tracks',
    },
    {
      segments: [
        { text: '蝉', reading: 'せみ' },
        { text: 'の' },
        { text: '声', reading: 'こえ' },
        { text: 'だけ ' },
        { text: '空', reading: 'そら' },
        { text: 'に' },
        { text: '響', reading: 'ひび' },
        { text: 'く' },
      ],
      translation: 'Only cicadas echo into the sky',
    },
    {
      segments: [
        { text: '錆', reading: 'さ' },
        { text: 'びたレールが ' },
        { text: '光', reading: 'ひか' },
        { text: 'っていた' },
      ],
      translation: 'The rusty rails were shining',
    },
    {
      segments: [
        { text: '遠', reading: 'とお' },
        { text: 'い' },
        { text: '汽', reading: 'き' },
        { text: '笛', reading: 'てき' },
        { text: 'を ' },
        { text: '追', reading: 'お' },
        { text: 'いかけた' },
      ],
      translation: 'Chasing a distant whistle',
    },
    {
      segments: [
        { text: '帽', reading: 'ぼう' },
        { text: '子', reading: 'し' },
        { text: 'の' },
        { text: '影', reading: 'かげ' },
        { text: 'に ' },
        { text: '汗', reading: 'あせ' },
        { text: 'が' },
        { text: '落', reading: 'お' },
        { text: 'ちる' },
      ],
      translation: 'Sweat falls in the shadow of my hat',
    },
    {
      segments: [
        { text: '駅', reading: 'えき' },
        { text: 'の' },
        { text: '名', reading: 'な' },
        { text: '前', reading: 'まえ' },
        { text: 'を ' },
        { text: '忘', reading: 'わす' },
        { text: 'れていた' },
      ],
      translation: 'Forgetting the name of the station',
    },
    {
      segments: [
        { text: '草', reading: 'くさ' },
        { text: 'の' },
        { text: '匂', reading: 'にお' },
        { text: 'いが ' },
        { text: '胸', reading: 'むね' },
        { text: 'に' },
        { text: '残', reading: 'のこ' },
        { text: 'る' },
      ],
      translation: 'The scent of grass stays in my chest',
    },
    {
      segments: [
        { text: '夕', reading: 'ゆう' },
        { text: '立', reading: 'だち' },
        { text: 'の' },
        { text: '前', reading: 'まえ' },
        { text: 'に ' },
        { text: '帰', reading: 'かえ' },
        { text: 'ろうか' },
      ],
      translation: 'Shall we go home before the summer rain?',
    },
    {
      segments: [
        { text: '赤', reading: 'あか' },
        { text: 'い' },
        { text: '夕', reading: 'ゆう' },
        { text: '日', reading: 'ひ' },
        { text: 'が ' },
        { text: '道', reading: 'みち' },
        { text: 'を' },
        { text: '照', reading: 'て' },
        { text: 'らす' },
      ],
      translation: 'The red sunset lights the road',
    },
    {
      segments: [
        { text: '踏', reading: 'ふみ' },
        { text: '切', reading: 'きり' },
        { text: 'の' },
        { text: '音', reading: 'おと' },
        { text: 'が ' },
        { text: '遠', reading: 'とお' },
        { text: 'くなる' },
      ],
      translation: 'The crossing bell grows distant',
    },
    {
      segments: [
        { text: '夏', reading: 'なつ' },
        { text: 'の' },
        { text: '終', reading: 'お' },
        { text: 'わりを ' },
        { text: '待', reading: 'ま' },
        { text: 'っていた' },
      ],
      translation: 'Waiting for summer to end',
    },
    {
      segments: [
        { text: '線', reading: 'せん' },
        { text: '路', reading: 'ろ' },
        { text: 'の' },
        { text: '先', reading: 'さき' },
        { text: 'へ ' },
        { text: '風', reading: 'かぜ' },
        { text: 'が' },
        { text: '吹', reading: 'ふ' },
        { text: 'く' },
      ],
      translation: 'The wind blows beyond the tracks',
    },
  ],
} satisfies Record<string, Omit<Line, 'id'>[]>;

/** Bundled, song-specific lyrics. No remote library or audio is used. */
function makeLines(songId: keyof typeof lyrics): Line[] {
  return lyrics[songId].map((line, index) => ({ id: `${songId}-${index}`, ...line }));
}

/** Plain lyrics for lists, labels, and neighbors that do not show ruby. */
export function getLineText(line: Line) {
  return line.segments.map((segment) => segment.text).join('');
}

const legacySongs: Song[] = [
  {
    id: 'dawn',
    title: '夜明けのバス',
    artist: 'ミナミ',
    album: '環状線',
    color: '#5c284e',
    accent: '#ee9255',
    rank: 'B',
    lines: makeLines('dawn'),
    albumId: 'dawn',
    artistId: 'minami',
    duration: 238,
    hasLyrics: true,
  },
  {
    id: 'glass',
    title: '硝子の街',
    artist: 'ミナミ',
    album: '硝子の街',
    color: '#164b4e',
    accent: '#74c58f',
    rank: 'S',
    lines: makeLines('glass'),
    albumId: 'glass',
    artistId: 'minami',
    duration: 214,
    hasLyrics: true,
  },
  {
    id: 'rain',
    title: '雨宿り',
    artist: '深海少女',
    album: '深海',
    color: '#293c6b',
    accent: '#a4c5ef',
    rank: 'A',
    lines: makeLines('rain'),
    albumId: 'rain',
    artistId: 'deep-sea',
    duration: 267,
    hasLyrics: true,
  },
  {
    id: 'dream',
    title: '白昼夢',
    artist: 'ミナミ',
    album: '白昼夢',
    color: '#523063',
    accent: '#d890c9',
    rank: null,
    lines: makeLines('dream'),
    albumId: 'dream',
    artistId: 'minami',
    duration: 193,
    hasLyrics: true,
  },
  {
    id: 'bluebird',
    title: 'Bluebird',
    artist: 'ヨルシカ',
    album: 'Bluebird',
    color: '#713e32',
    accent: '#e4ae74',
    rank: 'C',
    lines: makeLines('bluebird'),
    albumId: 'bluebird',
    artistId: 'yorushika',
    duration: 226,
    hasLyrics: true,
  },
  {
    id: 'summer',
    title: '夏草の線路',
    artist: 'ヨルシカ',
    album: '夏草の線路',
    color: '#23484a',
    accent: '#8bbfb3',
    rank: null,
    lines: makeLines('summer'),
    albumId: 'summer',
    artistId: 'yorushika',
    duration: 251,
    hasLyrics: true,
  },
];

/** Each album uses its original song's cover crop and palette. */
const legacyAlbums: Album[] = legacySongs.map((song) => ({
  id: song.albumId,
  title: song.album,
  artist: song.artist,
  artistId: song.artistId,
  color: song.color,
  accent: song.accent,
  year: song.id === 'dawn' ? 2024 : 2023,
}));

const legacyArtists: Artist[] = [
  { id: 'minami', name: 'ミナミ', color: legacySongs[0]!.color, accent: legacySongs[0]!.accent },
  { id: 'yorushika', name: 'ヨルシカ', color: legacySongs[4]!.color, accent: legacySongs[4]!.accent },
  { id: 'deep-sea', name: '深海少女', color: legacySongs[2]!.color, accent: legacySongs[2]!.accent },
];

/** Filler legacySongs share their album artwork and have no lyric or review fixtures. */
const fillerTitles: Record<string, string[]> = {
  dawn: ['始発駅', '眠らない街', '帰り道'],
  glass: ['窓辺', '街の灯'],
  rain: ['水面', '深い青'],
  dream: ['まどろみ', '夢の続き'],
  bluebird: ['風の便り', '小さな羽'],
  summer: ['夕立', '夏の終わり'],
};
for (const album of legacyAlbums) {
  for (const [index, title] of fillerTitles[album.id]!.entries()) {
    legacySongs.push({
      id: `${album.id}-song-${index + 2}`,
      title,
      artist: album.artist,
      album: album.title,
      albumId: album.id,
      artistId: album.artistId,
      color: album.color,
      accent: album.accent,
      duration: 180 + index * 27,
      rank: null,
      lines: [],
      hasLyrics: false,
    });
  }
}

/** One no-lyrics artist and album make cascade hiding and cover badges visible. */
const instrumental: Song = {
  id: 'tide',
  title: '潮の音',
  artist: '凪',
  album: '潮の音',
  artistId: 'nagi',
  albumId: 'tide',
  color: '#293c6b',
  accent: '#a4c5ef',
  duration: 204,
  rank: null,
  lines: [],
  hasLyrics: false,
};
legacySongs.push(instrumental);
legacyAlbums.push({
  id: instrumental.albumId,
  title: instrumental.album,
  artist: instrumental.artist,
  artistId: instrumental.artistId,
  color: instrumental.color,
  accent: instrumental.accent,
  year: 2024,
});
legacyArtists.push({
  id: instrumental.artistId,
  name: instrumental.artist,
  color: instrumental.color,
  accent: instrumental.accent,
});

/** Twelve ready lines plus a separate later group, matching the mockup counts. */
export function makeReviewList(): ReviewList {
  const lyricSongs = legacySongs.filter((song) => song.hasLyrics);
  return [
    { id: 'new-dawn', songId: 'dawn', sentenceId: 'dawn-3', kind: 'new' },
    { id: 'new-rain', songId: 'rain', sentenceId: 'rain-7', kind: 'new' },
    ...Array.from({ length: 10 }, (_, index) => {
      const song = lyricSongs[index % lyricSongs.length]!;
      return {
        id: `due-${index}`,
        songId: song.id,
        sentenceId: `${song.id}-${index === 0 ? 2 : index === 1 ? 6 : index + 1}`,
        kind: 'due' as const,
        misses: index === 0 ? 2 : 0,
      };
    }),
    { id: 'later-dawn', songId: 'dawn', sentenceId: 'dawn-8', kind: 'later', step: 0, dueAt: Date.now() + 86400000 },
    {
      id: 'later-dream',
      songId: 'dream',
      sentenceId: 'dream-11',
      kind: 'later',
      step: 0,
      dueAt: Date.now() + 86400000,
    },
  ];
}

export const songLyrics: Record<string, SongLyrics> = Object.fromEntries(
  legacySongs.map((song) => [
    song.id,
    withSentences({
      songId: song.id,
      lines: song.lines.map((line) => ({ ...line, id: `${song.id}:${getLineText(line).trim()}` })),
      timeline: song.lines.map((line, index) => ({
        lineId: `${song.id}:${getLineText(line).trim()}`,
        startMs: index * 9000,
        endMs: (index + 1) * 9000,
      })),
    }),
  ]),
);
export const songs: LibrarySong[] = legacySongs.map(({ color, accent, rank, lines, hasLyrics, ...song }, index) => ({
  ...song,
  track: index + 1,
  played: 1000 - index,
  lyricsStatus: hasLyrics ? 'synced' : 'none',
}));
export const albums = legacyAlbums.map(({ color, accent, ...album }) => ({
  ...album,
  songCount: songs.filter((song) => song.albumId === album.id).length,
}));
export const artists = legacyArtists.map(({ color, accent, ...artist }) => artist);
export const firstSong = songs[0]!;
export function fixtureLine(id: string) {
  const song = legacySongs.find((song) => song.lines.some((line) => line.id === id))!;
  return `${song.id}:${getLineText(song.lines.find((line) => line.id === id)!).trim()}`;
}
export function fixtureReviewList() {
  return makeReviewList().map((item) => ({ ...item, sentenceId: fixtureLine(item.sentenceId) }));
}

/** Small valid swaps for fixtures; behavior tests use explicit decoys. */
export const testDecoys = (translation: string) => [
  { from: translation.slice(0, 1), to: 'X', reason: 'Changes the sentence.' },
  { from: translation.slice(0, 1), to: 'Y', reason: 'Changes the sentence differently.' },
];
