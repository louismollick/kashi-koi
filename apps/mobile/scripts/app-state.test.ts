import assert from 'node:assert/strict';
import { beforeEach, test, type TestContext } from 'node:test';
import { registerHooks } from 'node:module';
import { currentOccurrence } from '../src/navidrome/lyrics';
import { sessionStore } from '../src/navidrome/session';
import { appStore, getRunSummary, setTransport, hydrateAppState, resetAppState } from '../src/store/appStore';
import { albums, artists, firstSong, songs, songLyrics, fixtureLine, fixtureReviewList } from './fixtures';
import { getAlbumSongs, getArtistAlbums, getLineText, getLyrics, libraryStore, occurrenceLine, isDue, dueLines, readyReviewLines } from '../src/store/libraryStore';
import { albumHasSyncedLyrics, artistHasSyncedLyrics, getRecentlyPlayed, getVisibleLibrary, getVisibleSongs, hasJapaneseLyrics, isHiddenSong } from '../src/data/libraryVisibility';


// Existing state sequences choose a translation explicitly, independent of button order.
const correctAnswer = () => occurrenceLine(appStore.getState().songId, appStore.getState().lineIndex)?.translation ?? 'no translation';
const clipAnswer = () => {
  const state = appStore.getState(), clip = state.clipReview!;
  const item = state.reviewList.find(item => item.id === clip.ids[clip.index])!;
  return getLyrics(item.songId).lines.find(line => line.id === item.lineId)!.translation!;
};

/** Read feedback for the selected review ID, including a clip with no answer yet. */
function clipResult() { const clip = appStore.getState().clipReview; return clip ? clip.answers[clip.ids[clip.index]!] ?.correct ?? null : null; }

const initialState = appStore.getState();
beforeEach(() => { void resetAppState(); libraryStore.getState().setLibrary({ songs, albums, artists, lyrics: songLyrics }); appStore.setState({ ...initialState, songId: firstSong.id, durationMs: firstSong.duration * 1000, playing: true, lineIndex: 3, reviewList: fixtureReviewList() }, true); });

test('a lost mark can be undone without removing pre-existing review lines', () => {
  const before = appStore.getState().reviewList.length;
  appStore.getState().jumpToLine(5);
  appStore.getState().addLostMark();
  assert.equal(appStore.getState().reviewList.length, before + 1);
  appStore.getState().addLostMark();
  assert.equal(appStore.getState().reviewList.length, before + 1);
  appStore.getState().undoLostMark();
  assert.equal(appStore.getState().reviewList.length, before);
  assert.ok(appStore.getState().reviewList.some(line => line.id === 'new-dawn'));
});

test('edit moves a new line and removal persists through the clip flow', () => {
  appStore.getState().startClipReview();
  appStore.getState().moveReviewLine('new-dawn', fixtureLine('dawn-4'));
  assert.equal(appStore.getState().reviewList.find(line => line.id === 'new-dawn')?.lineId, fixtureLine('dawn-4'));
  appStore.getState().removeReviewLine('new-dawn');
  assert.ok(!appStore.getState().reviewList.some(line => line.id === 'new-dawn'));
  assert.equal(appStore.getState().clipReview?.ids[0], 'new-rain');
});

test('three hits build a headbang combo and a miss resets it without completing due lines', () => {
  appStore.getState().setQuizToggle(true);
  for (let index = 0; index < 3; index++) {
    appStore.getState().answer(correctAnswer());
    // A second tap during feedback must not count twice.
    appStore.getState().answer(correctAnswer());
    assert.equal(appStore.getState().run.combo, index + 1);
    appStore.getState().advanceLine();
  }
  assert.equal(appStore.getState().run.combo, 3);
  appStore.getState().answer('wrong');
  assert.equal(appStore.getState().run.combo, 0);
  assert.equal(appStore.getState().run.bestCombo, 3);
  assert.ok(appStore.getState().reviewList.some(line => line.lineId === fixtureLine('glass-6') && line.kind === 'due'));
});

test('clip review is untimed and moves answered new lines onto the later schedule', () => {
  appStore.getState().startClipReview();
  appStore.getState().answerClip(clipAnswer());
  assert.equal(appStore.getState().reviewList.find(line => line.id === 'new-dawn')?.kind, 'later');
  assert.equal(appStore.getState().clipReview?.index, 0);
  appStore.getState().nextClip();
  assert.equal(appStore.getState().clipReview?.index, 1);
  assert.equal(clipResult(), null);
  appStore.getState().answerClip('wrong');
  assert.equal(appStore.getState().reviewList.find(line => line.id === 'new-rain')?.kind, 'due');
});

test('a full run finishes and only selected misses are sent to review', () => {
  appStore.getState().setQuizToggle(true);
  appStore.getState().jumpToLine(0);
  for (let index = 0; index < getLyrics(firstSong.id).lines.length; index++) {
    appStore.getState().answer(index === 0 ? 'wrong' : correctAnswer());
    appStore.getState().advanceLine();
  }
  assert.equal(appStore.getState().run.finished, true);
  assert.equal(Object.keys(appStore.getState().run.answers).length, 14);
  const missed = getLyrics(firstSong.id).lines[0]!.id;
  assert.ok(!appStore.getState().reviewList.some(line => line.lineId === missed));
  appStore.getState().sendToReview(missed, true);
  assert.ok(appStore.getState().reviewList.some(line => line.lineId === missed));
  appStore.getState().sendToReview(missed, false);
  assert.ok(!appStore.getState().reviewList.some(line => line.lineId === missed));
});

test('an empty review list disables review entry points', () => {
  appStore.setState({ reviewList: [] });
  appStore.getState().startClipReview();
  assert.deepEqual(appStore.getState().clipReview?.ids, []);
});

test('moving a lost mark frees its line without reusing the entry id', () => {
  appStore.getState().jumpToLine(5);
  appStore.getState().addLostMark();
  const firstId = appStore.getState().addedId!;
  appStore.getState().moveReviewLine(firstId, fixtureLine('dawn-4'));
  appStore.getState().addLostMark();
  const secondId = appStore.getState().addedId!;
  assert.notEqual(firstId, secondId);
  appStore.getState().undoLostMark();
  assert.equal(appStore.getState().reviewList.find(line => line.id === firstId)?.lineId, fixtureLine('dawn-4'));
  assert.ok(!appStore.getState().reviewList.some(line => line.id === secondId));
  appStore.getState().addLostMark();
  const thirdId = appStore.getState().addedId!;
  appStore.getState().removeReviewLine(firstId);
  assert.ok(appStore.getState().reviewList.some(line => line.id === thirdId));
});

test('moving an answered current clip resets it to new and permits another answer', () => {
  appStore.getState().startClipReview();
  appStore.getState().answerClip(clipAnswer());
  appStore.getState().moveReviewLine('new-dawn', fixtureLine('dawn-4'));
  assert.equal(appStore.getState().reviewList.find(line => line.id === 'new-dawn')?.kind, 'new');
  assert.equal(clipResult(), null);
  appStore.getState().answerClip('wrong');
  assert.equal(clipResult(), false);
  assert.equal(appStore.getState().reviewList.find(line => line.id === 'new-dawn')?.kind, 'due');
  appStore.getState().moveReviewLine('new-dawn', fixtureLine('dawn-5'));
  assert.equal(appStore.getState().reviewList.find(line => line.id === 'new-dawn')?.kind, 'new');
  assert.equal(clipResult(), null);
});

test('revisiting hits and misses preserves their recorded choice and cannot rescore', () => {
  appStore.getState().setQuizToggle(true);
  appStore.getState().jumpToLine(0);
  appStore.getState().answer('wrong');
  const miss = appStore.getState().run.answers[fixtureLine('dawn-0')];
  assert.deepEqual(miss, { choice: 'wrong', correct: false });
  appStore.getState().jumpToLine(1);
  appStore.getState().answer(correctAnswer());
  const hit = appStore.getState().run.answers[fixtureLine('dawn-1')];
  assert.deepEqual(hit, { choice: correctAnswer(), correct: true });
  appStore.getState().jumpToLine(0);
  appStore.getState().answer(correctAnswer());
  assert.deepEqual(appStore.getState().run.answers[fixtureLine('dawn-0')], miss);
  assert.equal(appStore.getState().run.combo, 1);
  appStore.getState().jumpToLine(1);
  appStore.getState().answer('wrong');
  assert.deepEqual(appStore.getState().run.answers[fixtureLine('dawn-1')], hit);
  assert.equal(appStore.getState().run.combo, 1);
  assert.equal(appStore.getState().run.bestCombo, 1);
  appStore.getState().restartRun();
  appStore.getState().answer(correctAnswer());
  assert.equal(appStore.getState().run.combo, 1);
});

test('moving onto another review entry is rejected, including later lines', () => {
  appStore.getState().startClipReview();
  appStore.getState().answerClip(clipAnswer());
  const before = appStore.getState();
  appStore.getState().moveReviewLine('new-dawn', fixtureLine('dawn-2'));
  assert.deepEqual(appStore.getState().reviewList, before.reviewList);
  assert.deepEqual(appStore.getState().clipReview, before.clipReview);
  appStore.getState().moveReviewLine('new-dawn', fixtureLine('dawn-8'));
  assert.deepEqual(appStore.getState().reviewList, before.reviewList);
  appStore.getState().moveReviewLine('new-dawn', fixtureLine('dawn-3'));
  assert.deepEqual(appStore.getState().reviewList, before.reviewList);
  assert.equal(clipResult(), true);
});

test('undo has an absolute three-second window which cannot restart after leaving the player', t => {
  let now = 10_000;
  t.mock.method(Date, 'now', () => now);
  appStore.getState().jumpToLine(5);
  appStore.getState().addLostMark();
  const id = appStore.getState().addedId!;
  assert.equal(appStore.getState().addedExpiresAt, 13_000);
  // Navigating away and back does not create a new mark or a new expiry.
  now += 3000;
  appStore.getState().undoLostMark();
  assert.ok(appStore.getState().reviewList.some(line => line.id === id));
  assert.equal(appStore.getState().addedId, null);
  appStore.getState().jumpToLine(4);
  appStore.getState().addLostMark();
  const nextId = appStore.getState().addedId!;
  now += 2999;
  appStore.getState().undoLostMark();
  assert.ok(!appStore.getState().reviewList.some(line => line.id === nextId));
  assert.ok(appStore.getState().reviewList.some(line => line.id === id));
});


test('answering only the last line grades against the entire song and counts skipped lines as misses', () => {
  appStore.getState().setQuizToggle(true);
  appStore.getState().jumpToLine(getLyrics(firstSong.id).lines.length - 1);
  appStore.getState().answer(correctAnswer());
  appStore.getState().advanceLine();
  const summary = getRunSummary(firstSong, appStore.getState().run);
  assert.equal(appStore.getState().run.finished, true);
  assert.equal(summary.hits, 1);
  assert.equal(summary.total, 14);
  assert.equal(summary.rank, 'C');
  assert.equal(summary.missed.length, 13);
  appStore.getState().restartRun();
  for (let index = 0; index < getLyrics(firstSong.id).lines.length; index++) {
    appStore.getState().answer(correctAnswer());
    appStore.getState().advanceLine();
  }
  assert.equal(getRunSummary(firstSong, appStore.getState().run).rank, 'S');
});


test('result entry ids also survive moving and adding the original line again', () => {
  appStore.getState().sendToReview(fixtureLine('dawn-0'), true);
  const firstId = appStore.getState().reviewList.find(line => line.lineId === fixtureLine('dawn-0'))!.id;
  appStore.getState().moveReviewLine(firstId, fixtureLine('dawn-1'));
  appStore.getState().sendToReview(fixtureLine('dawn-0'), true);
  const secondId = appStore.getState().reviewList.find(line => line.lineId === fixtureLine('dawn-0'))!.id;
  assert.notEqual(firstId, secondId);
  appStore.getState().sendToReview(fixtureLine('dawn-0'), false);
  assert.ok(appStore.getState().reviewList.some(line => line.id === firstId));
  assert.ok(!appStore.getState().reviewList.some(line => line.id === secondId));
});

test('moving another clip preserves the current answer', () => {
  appStore.getState().startClipReview();
  appStore.getState().answerClip(clipAnswer());
  appStore.getState().moveReviewLine('new-rain', fixtureLine('rain-4'));
  assert.equal(clipResult(), true);
  assert.equal(appStore.getState().reviewList.find(line => line.id === 'new-rain')?.kind, 'new');
});

test('song fixtures own their lyrics and review fixtures have distinct valid lines', () => {
  const umbrella = '傘の下で 君は何も言わなかった';
  assert.ok(!getLyrics(firstSong.id).lines.some(line => getLineText(line) === umbrella));
  assert.ok(getLyrics('rain').lines.some(line => getLineText(line) === umbrella));
  const texts = songs.flatMap(song => getLyrics(song.id).lines.map(getLineText));
  assert.equal(new Set(texts).size, texts.length);
  const review = appStore.getState().reviewList;
  assert.equal(new Set(review.map(line => line.lineId)).size, review.length);
  for (const entry of review) assert.ok(getLyrics(entry.songId).lines.some(line => line.id === entry.lineId));
});


test('albums group multiple songs in order without changing the original fixtures', () => {
  assert.deepEqual(songs.slice(0, 6).map(song => song.id), ['dawn', 'glass', 'rain', 'dream', 'bluebird', 'summer']);
  assert.equal(firstSong.duration, 238);
  assert.equal(new Set(songs.filter(song => (song.lyricsStatus === 'synced')).map(song => song.duration)).size, 6);
  assert.equal(new Set(songs.map(song => song.id)).size, songs.length);
  assert.equal(new Set(albums.map(album => album.id)).size, albums.length);
  for (const album of albums) {
    const grouped = getAlbumSongs(album.id);
    assert.ok(grouped.length >= (album.id === 'tide' ? 1 : 3));
    assert.equal(grouped[0]!.id, album.id);
    assert.ok(grouped.every(song => song.album === album.title && song.artistId === album.artistId));
    assert.ok(grouped.every(song => song.duration > 0 && (song.lyricsStatus === 'synced') === (getLyrics(song.id).lines.length > 0)));
  }
  assert.equal(albums.flatMap(album => getAlbumSongs(album.id)).length, songs.length);
  assert.equal(getAlbumSongs('dawn').length, 4);
  assert.deepEqual(getAlbumSongs('missing'), []);
});

test('artists group their albums and account for the entire library', () => {
  assert.deepEqual(getArtistAlbums('minami').map(album => album.id), ['dawn', 'glass', 'dream']);
  assert.equal(getArtistAlbums('yorushika').length, 2);
  assert.equal(getArtistAlbums('deep-sea').length, 1);
  for (const artist of artists) assert.ok(getArtistAlbums(artist.id).every(album => album.artist === artist.name));
  assert.equal(artists.flatMap(artist => getArtistAlbums(artist.id)).length, albums.length);
  assert.deepEqual(getArtistAlbums('missing'), []);
});

test('a no-lyrics song starts safely in listen and quiz modes with working transport', () => {
  appStore.getState().toggleHideSongsWithoutSyncedLyrics();
  appStore.setState({ hideSongsWithoutJapanese: false });
  const song = songs.find(song => song.lyricsStatus !== 'synced')!;
  for (const quiz of [false, true]) {
    appStore.getState().setQuizToggle(quiz);
    appStore.getState().startSong(song.id);
    assert.equal(appStore.getState().songId, song.id);
    assert.equal(appStore.getState().playing, true);
    assert.equal(appStore.getState().lineIndex, 0);
    assert.equal(appStore.getState().quizToggle, false);
    const before = appStore.getState().reviewList;
    appStore.getState().jumpToLine(-1);
    appStore.getState().jumpToLine(100);
    appStore.getState().answer(correctAnswer());
    appStore.getState().addLostMark();
    appStore.getState().advanceLine();
    assert.equal(appStore.getState().lineIndex, 0);
    assert.equal(appStore.getState().run.finished, false);
    assert.deepEqual(appStore.getState().run.answers, {});
    assert.deepEqual(appStore.getState().reviewList, before);
    appStore.getState().setPlaying(false);
    assert.equal(appStore.getState().playing, false);
    appStore.getState().setPlaying(true);
    assert.equal(appStore.getState().playing, true);
    appStore.getState().nextSong();
    assert.notEqual(appStore.getState().songId, song.id);
  }
});

test('visible songs, albums and artists follow the setting and cascade from synced lyrics', () => {
  const all = getVisibleLibrary({ hideUnsynced: false, hideNonJapanese: false });
  assert.deepEqual(all, { songs, albums, artists });
  const visible = getVisibleLibrary({ hideUnsynced: true, hideNonJapanese: false });
  assert.equal(visible.songs.length, 6);
  assert.ok(visible.songs.every(song => (song.lyricsStatus === 'synced') && getLyrics(song.id).lines.length));
  assert.equal(visible.albums.length, 6);
  assert.equal(visible.artists.length, 3);
  assert.equal(getVisibleSongs(getAlbumSongs('dawn'), { hideUnsynced: true, hideNonJapanese: false }).length, 1);
  assert.equal(getVisibleSongs(getAlbumSongs('dawn'), { hideUnsynced: false, hideNonJapanese: false }).length, 4);
  // The only deep-sea album loses synced lyrics, hiding its artist as well.
  const source = { songs: songs.map(song => song.id === 'rain' ? { ...song, lyricsStatus: 'none' as const } : song), albums, artists };
  const hidden = getVisibleLibrary({ hideUnsynced: true, hideNonJapanese: false }, source);
  assert.ok(!hidden.albums.some(album => album.id === 'rain'));
  assert.ok(!hidden.artists.some(artist => artist.id === 'deep-sea'));
  assert.equal(hidden.artists.length, 2);
  assert.equal(getVisibleLibrary({ hideUnsynced: false, hideNonJapanese: false }, source).albums.length, albums.length);
  assert.equal(getVisibleLibrary({ hideUnsynced: false, hideNonJapanese: false }, source).artists.length, artists.length);
  // A mixed artist stays visible when one of its albums is hidden.
  source.songs = source.songs.map(song => song.id === 'dawn' ? { ...song, lyricsStatus: 'none' as const } : song);
  const mixed = getVisibleLibrary({ hideUnsynced: true, hideNonJapanese: false }, source);
  assert.ok(!mixed.albums.some(album => album.id === 'dawn'));
  assert.ok(mixed.artists.some(artist => artist.id === 'minami'));
  assert.deepEqual(getVisibleLibrary({ hideUnsynced: true, hideNonJapanese: false }, { songs: [], albums: [], artists: [] }), { songs: [], albums: [], artists: [] });
});

test('album and artist badges distinguish mixed, lyric-only and no-lyrics collections', () => {
  assert.equal(albumHasSyncedLyrics('dawn'), true);
  assert.equal(artistHasSyncedLyrics('minami'), true);
  assert.equal(albumHasSyncedLyrics('dawn', [firstSong]), true);
  assert.equal(artistHasSyncedLyrics('minami', [firstSong]), true);
  assert.equal(albumHasSyncedLyrics('tide'), false);
  assert.equal(artistHasSyncedLyrics('nagi'), false);
  assert.equal(albumHasSyncedLyrics('dawn', getAlbumSongs('dawn').slice(1)), false);
  assert.equal(artistHasSyncedLyrics('minami', songs.filter(song => song.lyricsStatus !== 'synced')), false);
  assert.equal(albumHasSyncedLyrics('dawn', []), false);
  assert.equal(artistHasSyncedLyrics('minami', []), false);
  assert.equal(albumHasSyncedLyrics('missing'), false);
  assert.equal(artistHasSyncedLyrics('missing'), false);
  assert.ok(getVisibleLibrary({ hideUnsynced: false, hideNonJapanese: false }).albums.some(album => album.id === 'tide'));
  assert.ok(getVisibleLibrary({ hideUnsynced: false, hideNonJapanese: false }).artists.some(artist => artist.id === 'nagi'));
  assert.ok(!getVisibleLibrary({ hideUnsynced: true, hideNonJapanese: false }).albums.some(album => album.id === 'tide'));
  assert.ok(!getVisibleLibrary({ hideUnsynced: true, hideNonJapanese: false }).artists.some(artist => artist.id === 'nagi'));
});

test('Recently played leaves out hidden songs and preserves visible order', () => {
  const recent = [songs[6]!, firstSong, songs[7]!, songs[1]!];
  assert.deepEqual(getRecentlyPlayed({ hideUnsynced: true, hideNonJapanese: false }, 3, recent).map(song => song.id), ['dawn', 'glass']);
  assert.deepEqual(getRecentlyPlayed({ hideUnsynced: false, hideNonJapanese: false }, 3, recent).map(song => song.id), ['dawn', 'glass', songs[6]!.id]);
});

test('search does not reveal a hidden-only match until hiding is turned off', () => {
  const song = songs.find(song => song.lyricsStatus !== 'synced')!;
  const source = { songs: [song], albums: albums.filter(album => album.id === song.albumId), artists: artists.filter(artist => artist.id === song.artistId) };
  assert.deepEqual(getVisibleLibrary({ hideUnsynced: true, hideNonJapanese: false }, source), { songs: [], albums: [], artists: [] });
  assert.deepEqual(getVisibleLibrary({ hideUnsynced: false, hideNonJapanese: false }, source), source);
});

test('the default-on global setting toggles without interrupting the current hidden song', () => {
  assert.equal(appStore.getState().hideSongsWithoutSyncedLyrics, true);
  appStore.getState().toggleHideSongsWithoutSyncedLyrics();
  appStore.setState({ hideSongsWithoutJapanese: false });
  const hiddenSong = songs[6]!;
  appStore.getState().startSong(hiddenSong.id);
  appStore.getState().setPlaying(false);
  const before = appStore.getState();
  appStore.getState().toggleHideSongsWithoutSyncedLyrics();
  assert.equal(appStore.getState().hideSongsWithoutSyncedLyrics, true);
  assert.equal(appStore.getState().songId, hiddenSong.id);
  assert.equal(appStore.getState().playing, false);
  assert.equal(appStore.getState().run, before.run);
  appStore.getState().nextSong();
  assert.equal(appStore.getState().songId, 'dawn');
  appStore.setState({ songId: hiddenSong.id });
  appStore.getState().previousSong();
  assert.equal(appStore.getState().songId, 'summer');
});

test('next and previous songs wrap while skipping hidden songs in library order', () => {
  appStore.getState().startSong('summer');
  appStore.getState().nextSong();
  assert.equal(appStore.getState().songId, 'dawn');
  appStore.getState().previousSong();
  assert.equal(appStore.getState().songId, 'summer');
  appStore.getState().toggleHideSongsWithoutSyncedLyrics();
  appStore.setState({ hideSongsWithoutJapanese: false });
  appStore.getState().nextSong();
  assert.equal(appStore.getState().songId, songs[6]!.id);
  appStore.getState().previousSong();
  assert.equal(appStore.getState().songId, 'summer');
});

test('Previous restarts the song after 3 s and goes to the previous song before that', () => {
  appStore.getState().startSong('summer');
  appStore.getState().nextSong();
  appStore.getState().setQuizToggle(true);
  appStore.getState().updatePlayback(5000, 238000, true);
  appStore.getState().skipBack();
  assert.equal(appStore.getState().songId, 'dawn');
  assert.equal(appStore.getState().positionMs, 0);
  assert.deepEqual(appStore.getState().run.answers, {});
  appStore.getState().updatePlayback(2000, 238000, true);
  appStore.getState().skipBack();
  assert.equal(appStore.getState().songId, 'summer');
});

test('album Play and Shuffle build visible queues and skip songs hidden after starting', t => {
  t.mock.method(Math, 'random', () => 0);
  for (const shuffle of [false, true]) {
    appStore.getState().startAlbum('dawn', shuffle);
    assert.deepEqual(appStore.getState().playbackQueue, ['dawn']);
    appStore.getState().nextSong();
    assert.equal(appStore.getState().songId, 'dawn');
    appStore.getState().previousSong();
    assert.equal(appStore.getState().songId, 'dawn');
  }
  appStore.getState().toggleHideSongsWithoutSyncedLyrics();
  appStore.setState({ hideSongsWithoutJapanese: false });
  appStore.getState().startAlbum('dawn');
  assert.deepEqual(appStore.getState().playbackQueue, getAlbumSongs('dawn').map(song => song.id));
  appStore.getState().nextSong();
  assert.equal(appStore.getState().songId, 'dawn-song-2');
  appStore.getState().toggleHideSongsWithoutSyncedLyrics();
  appStore.getState().nextSong();
  assert.equal(appStore.getState().songId, 'dawn');
  appStore.getState().toggleHideSongsWithoutSyncedLyrics();
  appStore.getState().startAlbum('dawn', true);
  assert.deepEqual(appStore.getState().playbackQueue, ['dawn-song-2', 'dawn-song-3', 'dawn-song-4', 'dawn']);
  appStore.getState().toggleHideSongsWithoutSyncedLyrics();
  appStore.getState().previousSong();
  assert.equal(appStore.getState().songId, 'dawn');
  const before = appStore.getState();
  appStore.getState().startAlbum('missing', true);
  assert.equal(appStore.getState(), before);
});

test('injected transport loads, pauses and seeks occurrences', () => {
  const calls: string[] = [];
  setTransport({ load: song => calls.push(`load:${song.id}`), play: () => calls.push('play'), pause: () => calls.push('pause'), seek: ms => calls.push(`seek:${ms}`) });
  appStore.getState().startSong('dawn');
  appStore.getState().jumpToLine(2);
  appStore.getState().setPlaying(false);
  assert.deepEqual(calls, ['load:dawn', 'play', 'seek:18000', 'pause']);
  appStore.getState().nextSong();
  assert.deepEqual(calls.slice(-2), ['load:glass', 'play']);
  setTransport({ load() {}, play() {}, pause() {}, seek() {} });
});

test('audio status follows occurrence boundaries and instrumental gaps', () => {
  appStore.getState().startSong('dawn');
  appStore.getState().updatePlayback(19000, 238000, true);
  assert.equal(appStore.getState().lineIndex, 2);
  assert.equal(appStore.getState().positionMs, 19000);
  appStore.getState().updatePlayback(238000, 238000, false);
  assert.equal(appStore.getState().lineIndex, getLyrics('dawn').timeline.length - 1);
  assert.equal(appStore.getState().playing, false);
});

test('learning state survives hydration while playback stays transient, and reset wipes it', async () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
  await hydrateAppState(storage);
  appStore.getState().jumpToLine(5);
  appStore.getState().addLostMark();
  const mark = appStore.getState().reviewList.at(-1)!;
  appStore.setState({ ranks: { dawn: 'A' }, lastSyncAt: 1234, hideSongsWithoutSyncedLyrics: false, hideSongsWithoutJapanese: false, showTranslations: true, translationPrompted: true });
  const saved = values.get('learning-state')!;
  const data = JSON.parse(saved) as { state: Record<string, unknown> };
  assert.equal('songId' in data.state, false);
  assert.equal('positionMs' in data.state, false);
  assert.equal('run' in data.state, false);
  appStore.setState(appStore.getInitialState(), true);
  values.set('learning-state', saved);
  await appStore.persist.rehydrate();
  assert.ok(appStore.getState().reviewList.some(item => item.id === mark.id && item.lineId === mark.lineId));
  assert.equal(appStore.getState().ranks.dawn, 'A');
  assert.equal(appStore.getState().showTranslations, true);
  assert.equal(appStore.getState().translationPrompted, true);
  assert.equal(appStore.getState().songId, null);
  assert.equal(appStore.getState().hideSongsWithoutSyncedLyrics, false);
  assert.equal(appStore.getState().hideSongsWithoutJapanese, false);
  await resetAppState();
  assert.equal(appStore.getState().hideSongsWithoutJapanese, true);
  assert.equal(appStore.getState().hideSongsWithoutSyncedLyrics, true);
  assert.equal(values.has('learning-state'), false);
  assert.deepEqual(appStore.getState().reviewList, []);
  assert.equal(appStore.getState().showTranslations, false);
  assert.equal(appStore.getState().translationPrompted, false);
});

test('a lost mark between occurrences still marks the current Japanese line', () => {
  const lyrics = getLyrics('dawn');
  libraryStore.getState().setLyricsResult('dawn', 'synced', { ...lyrics, timeline: [{ ...lyrics.timeline[0]!, startMs: 1000, endMs: 3000 }, { ...lyrics.timeline[1]!, startMs: 6000 }] });
  appStore.setState({ reviewList: [] });
  appStore.getState().startSong('dawn');
  appStore.getState().updatePlayback(4500, 238000, true);
  assert.equal(appStore.getState().lineIndex, 0);
  appStore.getState().addLostMark();
  assert.equal(appStore.getState().reviewList[0]!.lineId, lyrics.timeline[0]!.lineId);
});

test('before the first occurrence next seeks the first line and previous seeks zero', () => {
  const lyrics = getLyrics('dawn'), seeks: number[] = [];
  libraryStore.getState().setLyricsResult('dawn', 'synced', { ...lyrics, timeline: lyrics.timeline.map(occurrence => ({ ...occurrence, startMs: occurrence.startMs + 2000, endMs: occurrence.endMs + 2000 })) });
  const detach = setTransport({ load() {}, play() {}, pause() {}, seek: ms => { seeks.push(ms); } });
  try {
    appStore.getState().startSong('dawn');
    appStore.getState().updatePlayback(0, 240000, true);
    assert.equal(appStore.getState().lineIndex, -1);
    appStore.getState().jumpToLine(appStore.getState().lineIndex - 1);
    assert.equal(appStore.getState().lineIndex, -1);
    appStore.getState().advanceLine();
    assert.deepEqual(seeks, [0, 2000]);
    assert.equal(appStore.getState().lineIndex, 0);
  } finally { detach(); }
});

test('stale transport cleanup leaves the newer transport active', () => {
  const calls: string[] = [];
  const stale = setTransport({ load() {}, play() {}, pause() {}, seek() {} });
  const active = setTransport({ load() {}, play: () => { calls.push('play'); }, pause() {}, seek() {} });
  assert.equal(stale(), false);
  appStore.getState().setPlaying(true);
  assert.deepEqual(calls, ['play']);
  assert.equal(active(), true);
  appStore.getState().setPlaying(true);
  assert.deepEqual(calls, ['play']);
});

/** Record audio requests without importing the native player. */
function clipTransport() {
  const calls: string[] = [];
  const detach = setTransport({ load: (song, startMs) => { calls.push(`load:${song.id}:${startMs ?? 0}`); }, play: () => { calls.push('play'); }, pause: () => { calls.push('pause'); }, seek: ms => { calls.push(`seek:${ms}`); } });
  return { calls, detach };
}

test('starting clip review pauses music and autoplays the first occurrence', () => {
  const { calls, detach } = clipTransport();
  try {
    appStore.getState().startSong('glass');
    appStore.getState().setQuizToggle(true);
    appStore.setState({ playbackQueue: ['glass', 'dawn'] });
    const before = appStore.getState();
    calls.length = 0;
    appStore.getState().startClipReview();
    const state = appStore.getState(), item = state.reviewList.find(item => item.id === state.clipReview!.ids[0])!;
    const occurrence = getLyrics(item.songId).timeline.find(occurrence => occurrence.lineId === item.lineId)!;
    assert.deepEqual(calls, ['pause', 'pause', `load:${item.songId}:${occurrence.startMs}`, 'play']);
    assert.equal(state.clipPlayback?.positionMs, occurrence.startMs);
    assert.equal(state.playing, true);
    assert.equal(state.songId, 'glass');
    assert.equal(state.run, before.run);
    assert.equal(state.quizToggle, before.quizToggle);
    assert.equal(state.playbackQueue, before.playbackQueue);
  } finally { detach(); }
});

test('different-song clips load at their start while same-song replays seek', () => {
  const { calls, detach } = clipTransport();
  try {
    appStore.getState().startSong('glass');
    calls.length = 0;
    appStore.getState().playClip('dawn', 18000, 24000);
    appStore.getState().setPlaying(false);
    appStore.getState().playClip('dawn', 18000, 24000);
    assert.deepEqual(calls, ['pause', 'load:dawn:18000', 'play', 'pause', 'pause', 'seek:18000', 'play']);
  } finally { detach(); }
});

test('clips pause at their end without advancing or changing the main learning state', () => {
  const { calls, detach } = clipTransport();
  const nextSong = appStore.getState().nextSong;
  let nextCalls = 0;
  try {
    appStore.setState({ playbackQueue: ['dawn', 'glass'], nextSong: () => { nextCalls++; } });
    const before = appStore.getState();
    appStore.getState().playClip('rain', 18000, 24000);
    appStore.getState().updatePlayback(18000, 238000, false);
    assert.equal(appStore.getState().playing, false);
    appStore.getState().updatePlayback(23999, 238000, true);
    assert.equal(appStore.getState().playing, true);
    appStore.getState().updatePlayback(24100, 238000, true);
    appStore.getState().updatePlayback(24200, 238000, true);
    const after = appStore.getState();
    assert.equal(after.playing, false);
    assert.equal(after.clipPlayback?.positionMs, 24000);
    assert.equal(after.positionMs, before.positionMs);
    assert.equal(after.songId, before.songId);
    assert.equal(after.lineIndex, before.lineIndex);
    assert.equal(after.quizToggle, before.quizToggle);
    assert.equal(after.mode, before.mode);
    assert.equal(after.run, before.run);
    assert.equal(after.playbackQueue, before.playbackQueue);
    assert.equal(nextCalls, 0);
    assert.equal(calls.at(-1), 'pause');
    assert.equal(calls.filter(call => call === 'pause').length, 2);
  } finally { appStore.setState({ nextSong }); detach(); }
});

test('Next autoplays and finishing or leaving review pauses audio', () => {
  const { calls, detach } = clipTransport();
  try {
    appStore.getState().startClipReview();
    appStore.getState().nextClip();
    const state = appStore.getState(), item = state.reviewList.find(item => item.id === state.clipReview!.ids[1])!;
    const occurrence = getLyrics(item.songId).timeline.find(occurrence => occurrence.lineId === item.lineId)!;
    assert.equal(state.clipPlayback?.startMs, occurrence.startMs);
    assert.equal(state.clipPlayback?.songId, item.songId);
    assert.equal(state.playing, true);
    appStore.getState().stopClipReview();
    assert.equal(appStore.getState().playing, false);
    assert.equal(appStore.getState().clipReview, null);
    assert.equal(calls.at(-1), 'pause');
    appStore.getState().startClipReview();
    while (appStore.getState().clipReview) appStore.getState().nextClip();
    assert.equal(appStore.getState().playing, false);
    assert.equal(calls.at(-1), 'pause');
  } finally { detach(); }
});

test('moving or removing the current review line pauses its old clip', () => {
  const { detach } = clipTransport();
  try {
    appStore.getState().startClipReview();
    let state = appStore.getState(), item = state.reviewList.find(item => item.id === state.clipReview!.ids[0])!;
    const target = getLyrics(item.songId).lines.find(line => !state.reviewList.some(item => item.lineId === line.id))!;
    appStore.getState().moveReviewLine(item.id, target.id);
    assert.equal(appStore.getState().playing, false);
    appStore.getState().startClipReview();
    state = appStore.getState();
    appStore.getState().removeReviewLine(state.clipReview!.ids[0]!);
    assert.equal(appStore.getState().playing, false);
  } finally { detach(); }
});

test('main player resumes its original song and position after a clip', () => {
  const { calls, detach } = clipTransport();
  try {
    appStore.getState().startSong('glass');
    appStore.getState().updatePlayback(9000, 200000, true);
    const run = appStore.getState().run;
    appStore.getState().playClip('dawn', 18000, 24000);
    appStore.getState().stopClipReview();
    calls.length = 0;
    appStore.getState().setPlaying(true);
    assert.deepEqual(calls, ['pause', 'load:glass:9000', 'play']);
    assert.equal(appStore.getState().clipPlayback, null);
    assert.equal(appStore.getState().run, run);
  } finally { detach(); }
});

test('clip review uses the first occurrence when the line repeats', () => {
  const { calls, detach } = clipTransport();
  try {
    const lyrics = getLyrics('dawn'), first = { ...lyrics.timeline[0]!, startMs: 1000, endMs: 6000 };
    libraryStore.getState().setLyricsResult('dawn', 'synced', { ...lyrics, timeline: [first, { ...first, startMs: 11000, endMs: 16000 }] });
    appStore.setState({ reviewList: [{ id: 'repeated', songId: 'dawn', lineId: first.lineId, kind: 'new' }] });
    appStore.getState().startClipReview();
    assert.deepEqual(calls, ['pause', 'pause', 'load:dawn:1000', 'play']);
    assert.equal(appStore.getState().clipPlayback?.endMs, 6000);
  } finally { detach(); }
});

test('main-player line seeking restores the original source after a different-song clip', () => {
  const { calls, detach } = clipTransport();
  try {
    appStore.getState().startSong('glass');
    appStore.getState().playClip('dawn', 18000, 24000);
    appStore.getState().stopClipReview();
    calls.length = 0;
    appStore.getState().jumpToLine(2);
    assert.deepEqual(calls, ['load:glass:18000']);
    assert.equal(appStore.getState().clipPlayback, null);
    assert.equal(appStore.getState().playing, false);
    assert.equal(appStore.getState().positionMs, 18000);
  } finally { detach(); }
});


/** Start a translated fixture at its first occurrence with the injected player. */
function pacingRun(answerTime: number | null = null) {
  const fake = clipTransport();
  appStore.getState().startSong('dawn');
  appStore.getState().setQuizToggle(true);
  appStore.setState({ answerTime });
  fake.calls.length = 0;
  return fake;
}

/** Deliver the first line's boundary just inside the pause tolerance. */
function stopFirstLine() { appStore.getState().updatePlayback(8900, 238000, true); }

test('quiz holds an unanswered Japanese occurrence on the first end update', () => {
  const { calls, detach } = pacingRun();
  try {
    appStore.getState().updatePlayback(8799, 238000, true);
    assert.equal(appStore.getState().answerWait, null);
    appStore.getState().updatePlayback(9050, 238000, true);
    assert.deepEqual(appStore.getState().answerWait, { lineIndex: 0, until: null });
    assert.equal(appStore.getState().lineIndex, 0);
    assert.equal(appStore.getState().playing, false);
    assert.deepEqual(calls, ['pause']);
    appStore.getState().updatePlayback(9050, 238000, false);
    assert.equal(appStore.getState().lineIndex, 0);
  } finally { detach(); }
});

for (const skip of ['answered', 'repeated', 'English', 'listen', 'zero', 'no choices', 'clip'] as const) test(`quiz pacing skips ${skip} lines`, () => {
  const { calls, detach } = pacingRun();
  try {
    if (skip === 'answered' || skip === 'repeated') appStore.getState().answer(correctAnswer());
    if (skip === 'repeated') {
      const lyrics = getLyrics('dawn');
      libraryStore.setState({ lyrics: { ...libraryStore.getState().lyrics, dawn: { ...lyrics, timeline: [...lyrics.timeline, { ...lyrics.timeline[0]!, startMs: 130000, endMs: 139000 }] } } });
      appStore.getState().jumpToLine(14);
    }
    if (skip === 'English') {
      const lyrics = getLyrics('dawn');
      libraryStore.setState({ lyrics: { ...libraryStore.getState().lyrics, dawn: { ...lyrics, lines: lyrics.lines.map((line, index) => index ? line : { ...line, segments: [{ text: 'English only' }] }) } } });
    }
    if (skip === 'listen') appStore.getState().setQuizToggle(false);
    if (skip === 'zero') appStore.setState({ answerTime: 0 });
    if (skip === 'no choices') appStore.setState({ run: { ...appStore.getState().run, choices: { [fixtureLine('dawn-0')]: [] } } });
    if (skip === 'clip') appStore.getState().playClip('dawn', 0, 12000);
    calls.length = 0;
    appStore.getState().updatePlayback(skip === 'repeated' ? 138900 : 8900, 238000, true);
    assert.equal(appStore.getState().answerWait, null);
    assert.equal(appStore.getState().playing, true);
    assert.deepEqual(calls, []);
  } finally { detach(); }
});

test('answer replaces the deadline with exactly 800 ms of feedback', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { calls, detach } = pacingRun(3);
  try {
    stopFirstLine();
    t.mock.timers.tick(2900);
    appStore.getState().answer(correctAnswer());
    assert.equal(appStore.getState().answerWait?.until, null);
    t.mock.timers.tick(799);
    assert.equal(appStore.getState().playing, false);
    appStore.getState().answer(correctAnswer());
    t.mock.timers.tick(1);
    assert.equal(appStore.getState().answerWait, null);
    assert.equal(appStore.getState().playing, true);
    assert.equal(appStore.getState().run.combo, 1);
    assert.deepEqual(calls, ['pause', 'play']);
  } finally { detach(); }
});

test('timeout resumes unanswered, counts a miss, and preserves combo', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { calls, detach } = pacingRun(5);
  try {
    appStore.setState({ run: { ...appStore.getState().run, combo: 2 } });
    stopFirstLine();
    assert.equal(appStore.getState().answerWait?.until, Date.now() + 5000);
    t.mock.timers.tick(4999);
    assert.equal(appStore.getState().playing, false);
    t.mock.timers.tick(1);
    assert.equal(appStore.getState().playing, true);
    assert.equal(appStore.getState().answerWait, null);
    assert.equal(appStore.getState().run.combo, 2);
    assert.equal(appStore.getState().run.answers[fixtureLine('dawn-0')], undefined);
    assert.ok(getRunSummary(firstSong, appStore.getState().run).missed.some(line => line.id === fixtureLine('dawn-0')));
    assert.deepEqual(calls, ['pause', 'play']);
    stopFirstLine();
    assert.equal(appStore.getState().answerWait, null);
    appStore.getState().jumpToLine(0);
    stopFirstLine();
    assert.equal(appStore.getState().answerWait?.lineIndex, 0);
    appStore.getState().setPlaying(false);
  } finally { detach(); }
});

for (const action of ['play', 'quiz off', 'restart', 'song', 'next song', 'previous song', 'seek', 'next line', 'lane', 'complete', 'clip'] as const) test(`${action} releases the wait and cancels its timer`, t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { calls, detach } = pacingRun(3);
  try {
    stopFirstLine();
    const state = appStore.getState();
    if (action === 'play') state.setPlaying(true);
    if (action === 'quiz off') state.setQuizToggle(false);
    if (action === 'restart') state.restartRun();
    if (action === 'song') state.startSong('glass');
    if (action === 'next song') state.nextSong();
    if (action === 'previous song') state.previousSong();
    if (action === 'next line') state.advanceLine();
    if (action === 'seek') state.seek(19000);
    if (action === 'lane') state.jumpToLine(2);
    if (action === 'complete') state.completeRun();
    if (action === 'clip') state.playClip('dawn', 0, 12000);
    assert.equal(appStore.getState().answerWait, null);
    assert.equal(appStore.getState().playing, action !== 'complete');
    if (action === 'play') { stopFirstLine(); assert.equal(appStore.getState().answerWait, null); }
    const before = [...calls];
    appStore.setState({ playing: false });
    t.mock.timers.tick(4000);
    assert.deepEqual(calls, before);
    assert.equal(appStore.getState().playing, false);
  } finally { detach(); }
});

for (const eof of ['before wait', 'during wait'] as const) {
  for (const release of ['answer', 'timeout', 'play'] as const) test(`last-line ${release} completes when EOF arrives ${eof}`, t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { calls, detach } = pacingRun(release === 'timeout' ? 3 : null);
    try {
      const lyrics = getLyrics('dawn'), index = lyrics.timeline.length - 1;
      libraryStore.setState({ lyrics: { ...libraryStore.getState().lyrics, dawn: { ...lyrics, timeline: lyrics.timeline.map((occurrence, i) => i === index ? { ...occurrence, endMs: 238000 } : occurrence) } } });
      appStore.getState().jumpToLine(index);
      calls.length = 0;
      if (eof === 'during wait') appStore.getState().updatePlayback(237900, 238000, true);
      else appStore.setState({ playing: false });
      appStore.getState().updatePlayback(238000, 238000, false);
      assert.equal(appStore.getState().answerWait?.lineIndex, index);
      assert.equal(appStore.getState().run.finished, false);
      assert.deepEqual(calls, ['pause']);
      if (release === 'answer') {
        appStore.getState().answer(correctAnswer());
        t.mock.timers.tick(799);
        assert.equal(appStore.getState().run.finished, false);
        t.mock.timers.tick(1);
      } else if (release === 'timeout') t.mock.timers.tick(3000);
      else appStore.getState().setPlaying(true);
      assert.equal(appStore.getState().answerWait, null);
      assert.equal(appStore.getState().run.finished, true);
      assert.equal(appStore.getState().playing, false);
      assert.deepEqual(calls, ['pause', 'pause']);
      appStore.getState().updatePlayback(238000, 238000, false);
      assert.equal(appStore.getState().answerWait, null);
      t.mock.timers.tick(3000);
      assert.deepEqual(calls, ['pause', 'pause']);
    } finally { detach(); }
  });
}

test('answer-time presets persist without the wait and logout restores no limit', async () => {
  const values = new Map<string, string>();
  await hydrateAppState({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } });
  for (const value of [10, 5, 3, 0, null]) { appStore.getState().cycleAnswerTime(); assert.equal(appStore.getState().answerTime, value); }
  appStore.getState().cycleAnswerTime();
  const saved = values.get('learning-state')!;
  assert.equal('answerWait' in (JSON.parse(saved) as { state: Record<string, unknown> }).state, false);
  appStore.setState(appStore.getInitialState(), true);
  values.set('learning-state', saved);
  await appStore.persist.rehydrate();
  assert.equal(appStore.getState().answerTime, 10);
  await resetAppState();
  assert.equal(appStore.getState().answerTime, null);
  assert.equal(appStore.getState().answerWait, null);
});


test('no-limit wait stays paused until an answer, including a wrong answer', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { calls, detach } = pacingRun();
  try {
    stopFirstLine();
    t.mock.timers.tick(60000);
    assert.equal(appStore.getState().playing, false);
    appStore.getState().answer('wrong');
    t.mock.timers.tick(799);
    assert.equal(appStore.getState().playing, false);
    t.mock.timers.tick(1);
    assert.equal(appStore.getState().playing, true);
    assert.deepEqual(calls, ['pause', 'play']);
  } finally { detach(); }
});

/** Replace only native audio and SQLite; run the real transport listener and store. */
async function nativePacingRun(t: TestContext) {
  const calls: string[] = [];
  type Status = { playing: boolean; currentTime: number; duration: number; isLoaded: boolean; didJustFinish: boolean; isBuffering: boolean };
  let listener: (status: Status) => void = () => {};
  const player = {
    play: () => { calls.push('play'); },
    pause: () => { calls.push('pause'); },
    seekTo: async (seconds: number) => { calls.push(`seek:${seconds}`); },
    replace: () => {},
    setActiveForLockScreen: () => {},
    clearLockScreenControls: () => {},
    remove: () => {},
    addListener: (_event: string, callback: typeof listener) => { listener = callback; return { remove() {} }; },
  };
  const audio = {
    createAudioPlayer: () => player,
    setAudioModeAsync: async () => {},
    setIsAudioActiveAsync: async () => {},
  };
  const audioKey = Symbol.for('kashi-koi.test.audio');
  const globals = globalThis as typeof globalThis & { [audioKey]: typeof audio | undefined };
  globals[audioKey] = audio;
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'expo-audio') return { url: 'test:audio', shortCircuit: true };
      if (specifier === '@/navidrome/db' && context.parentURL?.includes('/src/audio/transport.ts')) return { url: 'test:db', shortCircuit: true };
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url === 'test:audio') return { format: 'commonjs', source: "module.exports = { createAudioPlayer: () => globalThis[Symbol.for('kashi-koi.test.audio')].createAudioPlayer(), setAudioModeAsync: async () => {}, setIsAudioActiveAsync: async () => {} };", shortCircuit: true };
      if (url === 'test:db') return { format: 'commonjs', source: 'exports.savePlayed = async () => {};', shortCircuit: true };
      return nextLoad(url, context);
    },
  });
  let setupTransport: typeof import('../src/audio/transport').setupTransport;
  try { ({ setupTransport } = await import('../src/audio/transport')); }
  finally { hooks.deregister(); }
  const previousSession = sessionStore.getState().session;
  sessionStore.setState({ session: { url: 'https://music.test', username: 'user', token: 'token', salt: 'salt' } });
  t.mock.method(globalThis, 'fetch', async () => Response.json({ 'subsonic-response': { status: 'ok' } }));
  const detach = await setupTransport();
  const status = (positionMs: number, playing: boolean, didJustFinish = false, isBuffering = false) => listener({ currentTime: positionMs / 1000, duration: 238, isLoaded: true, playing, didJustFinish, isBuffering });
  appStore.getState().startSong('dawn');
  appStore.getState().setQuizToggle(true);
  status(0, false);
  await Promise.resolve();
  calls.length = 0;
  return { calls, status, detach: () => { detach(); sessionStore.setState({ session: previousSession }); delete globals[audioKey]; } };
}

test('queued native playing status keeps the wait and answering resumes after 800 ms', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { calls, status, detach } = await nativePacingRun(t);
  try {
    status(8900, true);
    status(8950, true);
    assert.deepEqual(appStore.getState().answerWait, { lineIndex: 0, until: null });
    assert.equal(appStore.getState().playing, false);
    assert.equal(appStore.getState().positionMs, 8950);
    assert.deepEqual(calls, ['pause']);
    appStore.getState().answer(correctAnswer());
    t.mock.timers.tick(799);
    assert.equal(appStore.getState().playing, false);
    t.mock.timers.tick(1);
    assert.equal(appStore.getState().answerWait, null);
    assert.equal(appStore.getState().playing, true);
    assert.deepEqual(calls, ['pause', 'play']);
  } finally { detach(); }
});

test('acknowledged native pause permits external resume and playback resumes after seeking', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { calls, status, detach } = await nativePacingRun(t);
  try {
    appStore.setState({ answerTime: 3 });
    status(8900, true);
    status(8950, false);
    assert.ok(appStore.getState().answerWait);
    status(8950, true);
    assert.equal(appStore.getState().answerWait, null);
    assert.equal(appStore.getState().playing, true);
    status(8950, true);
    assert.equal(appStore.getState().answerWait, null);
    appStore.getState().jumpToLine(1);
    await Promise.resolve();
    assert.deepEqual(calls, ['pause', 'play', 'pause', 'seek:9', 'play']);
    t.mock.timers.tick(3000);
    assert.deepEqual(calls, ['pause', 'play', 'pause', 'seek:9', 'play']);
  } finally { detach(); }
});

for (const eof of ['before wait', 'during wait'] as const) {
  for (const release of ['answer', 'external resume'] as const) test(`native EOF ${eof} holds the last line until ${release}`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { calls, status, detach } = await nativePacingRun(t);
    try {
      const lyrics = getLyrics('dawn'), index = lyrics.timeline.length - 1;
      libraryStore.setState({ lyrics: { ...libraryStore.getState().lyrics, dawn: { ...lyrics, timeline: lyrics.timeline.map((occurrence, i) => i === index ? { ...occurrence, endMs: 238000 } : occurrence) } } });
      appStore.getState().jumpToLine(index);
      await Promise.resolve();
      calls.length = 0;
      if (eof === 'during wait') status(237900, true);
      status(238000, false, true);
      assert.equal(appStore.getState().answerWait?.lineIndex, index);
      assert.equal(appStore.getState().run.finished, false);
      assert.deepEqual(calls, ['pause']);
      if (release === 'answer') {
        appStore.getState().answer(correctAnswer());
        t.mock.timers.tick(800);
      } else {
        // The EOF status started a new pause; acknowledge it before external Play.
        status(238000, false);
        status(238000, true);
      }
      assert.equal(appStore.getState().answerWait, null);
      assert.equal(appStore.getState().run.finished, true);
      assert.equal(appStore.getState().playing, false);
      assert.deepEqual(calls, ['pause', 'pause']);
    } finally { detach(); }
  });
}

for (const which of ['first', 'last'] as const) test(`refresh replays the stopped ${which} line, pauses its timer and stops again`, t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { calls, detach } = pacingRun(3);
  const last = getLyrics('dawn').timeline.length - 1, index = which === 'first' ? 0 : last;
  try {
    appStore.getState().jumpToLine(index);
    const occurrence = getLyrics('dawn').timeline[index]!;
    appStore.getState().updatePlayback(occurrence.endMs - 100, 238000, true);
    assert.equal(appStore.getState().answerWait?.lineIndex, index);
    calls.length = 0;
    appStore.getState().replayLine();
    assert.equal(appStore.getState().positionMs, occurrence.startMs);
    assert.equal(appStore.getState().answerWait, null);
    assert.equal(appStore.getState().run.finished, false);
    assert.equal(appStore.getState().playing, true);
    assert.deepEqual(calls, [`seek:${occurrence.startMs}`, 'play']);
    appStore.getState().updatePlayback(occurrence.startMs + 100, 238000, true);
    t.mock.timers.tick(3000);
    assert.equal(appStore.getState().answerWait, null);
    appStore.getState().updatePlayback(occurrence.endMs - 100, 238000, true);
    assert.equal(appStore.getState().answerWait?.lineIndex, index);
    assert.equal(appStore.getState().playing, false);
    appStore.getState().advanceLine();
    assert.equal(appStore.getState().answerWait, null);
    if (index === last) assert.equal(appStore.getState().run.finished, true);
    else assert.equal(appStore.getState().lineIndex, index + 1);
  } finally { detach(); }
});

test('clip controls resume inside a clip and refresh from its start after the end', () => {
  const { calls, detach } = clipTransport();
  try {
    appStore.getState().startClipReview();
    const clip = appStore.getState().clipPlayback!;
    appStore.getState().updatePlayback(clip.startMs + 1000, 238000, true);
    appStore.getState().setPlaying(false);
    calls.length = 0;
    appStore.getState().setPlaying(true);
    assert.deepEqual(calls, ['play']);
    assert.equal(appStore.getState().clipPlayback?.positionMs, clip.startMs + 1000);
    appStore.getState().updatePlayback(clip.endMs, 238000, true);
    assert.equal(appStore.getState().playing, false);
    calls.length = 0;
    appStore.getState().setPlaying(true);
    assert.deepEqual(calls, ['pause', `seek:${clip.startMs}`, 'play']);
    assert.equal(appStore.getState().clipPlayback?.positionMs, clip.startMs);
    assert.equal(appStore.getState().clipReview?.index, 0);
  } finally { detach(); }
});

test('clip feedback advances after 800 ms, preserves prior answers and grades combo only once', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { detach } = clipTransport();
  try {
    appStore.getState().startClipReview();
    appStore.getState().answerClip(clipAnswer());
    const first = appStore.getState().clipReview!;
    const answer = first.answers[first.ids[0]!]!;
    assert.equal(first.combo, 1);
    t.mock.timers.tick(799);
    assert.equal(appStore.getState().clipReview?.index, 0);
    t.mock.timers.tick(1);
    assert.equal(appStore.getState().clipReview?.index, 1);
    assert.equal(appStore.getState().playing, true);
    appStore.getState().answerClip(clipAnswer());
    assert.equal(appStore.getState().clipReview?.combo, 2);
    t.mock.timers.tick(800);
    appStore.getState().jumpToClip(0);
    assert.deepEqual(appStore.getState().clipReview?.answers[first.ids[0]!], answer);
    const reviewed = appStore.getState().reviewList;
    appStore.getState().answerClip('wrong');
    assert.equal(appStore.getState().reviewList, reviewed);
    assert.equal(appStore.getState().clipReview?.combo, 2);
    t.mock.timers.tick(800);
    assert.equal(appStore.getState().clipReview?.index, 0);
    appStore.getState().jumpToClip(2);
    appStore.getState().answerClip('wrong');
    assert.equal(appStore.getState().clipReview?.combo, 0);
    appStore.getState().jumpToClip(first.ids.length - 1);
    appStore.getState().answerClip(clipAnswer());
    t.mock.timers.tick(800);
    assert.equal(appStore.getState().clipReview, null);
    assert.equal(appStore.getState().playing, false);
  } finally { detach(); }
});

test('leaving clip review cancels the pending answer beat', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { calls, detach } = clipTransport();
  try {
    appStore.getState().startClipReview(); appStore.getState().answerClip(clipAnswer());
    appStore.getState().stopClipReview(); const before = [...calls];
    t.mock.timers.tick(800); assert.deepEqual(calls, before);
    assert.equal(appStore.getState().clipReview, null);
  } finally { detach(); }
});

test('prelude keeps quiz mode at lineIndex -1 with no answer choices', () => {
  const { detach } = pacingRun();
  try {
    const lyrics = getLyrics('dawn');
    libraryStore.setState({ lyrics: { ...libraryStore.getState().lyrics, dawn: { ...lyrics, timeline: lyrics.timeline.map(line => ({ ...line, startMs: line.startMs + 1000, endMs: line.endMs + 1000 })) } } });
    appStore.getState().updatePlayback(0, 238000, true);
    assert.equal(appStore.getState().lineIndex, -1);
    assert.equal(appStore.getState().mode, 'quiz');
    assert.equal(appStore.getState().quizToggle, true);
    assert.equal(occurrenceLine('dawn', -1), undefined);
    assert.equal(appStore.getState().answerWait, null);
  } finally { detach(); }
});

test('repeated song taps during loading issue one load and retain the current run', () => {
  const { calls, detach } = clipTransport();
  try {
    appStore.getState().startSong('dawn'); const run = appStore.getState().run;
    appStore.getState().startSong('dawn');
    assert.deepEqual(calls, ['load:dawn:0', 'play']);
    assert.equal(appStore.getState().run, run);
    assert.equal(appStore.getState().loading, true);
    appStore.getState().startSong('glass'); appStore.getState().startSong('glass');
    assert.deepEqual(calls.slice(2), ['load:glass:0', 'play']);
    assert.equal(appStore.getState().songId, 'glass');
  } finally { detach(); }
});

test('native loaded status ends loading and clip EOF does not mark played, scrobble or advance songs', async t => {
  const { status, detach } = await nativePacingRun(t);
  try {
    assert.equal(appStore.getState().loading, false);
    const fetches = t.mock.method(globalThis, 'fetch', async () => Response.json({ 'subsonic-response': { status: 'ok' } }));
    const played = t.mock.method(libraryStore.getState(), 'markPlayed', () => {});
    const next = t.mock.method(appStore.getState(), 'nextSong', () => {});
    const complete = t.mock.method(appStore.getState(), 'completeRun', () => {});
    appStore.setState({ reviewList: [{ id: 'end', songId: 'glass', lineId: fixtureLine('glass-0'), kind: 'due', misses: 1 }] });
    appStore.getState().startClipReview();
    status(0, false); await Promise.resolve();
    status(238000, false, true);
    assert.equal(fetches.mock.callCount(), 0);
    assert.equal(played.mock.callCount(), 0);
    assert.equal(next.mock.callCount(), 0);
    assert.equal(complete.mock.callCount(), 0);
    assert.equal(appStore.getState().clipReview?.index, 0);
    assert.equal(appStore.getState().playing, false);
  } finally { detach(); }
});

for (const edit of ['invalid move', 'other move', 'other removal', 'invalid jump'] as const) test(`${edit} preserves the current clip's 800 ms answer beat`, t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { detach } = clipTransport();
  try {
    appStore.getState().startClipReview();
    appStore.getState().answerClip(clipAnswer());
    const first = appStore.getState().clipReview!.ids[0]!;
    if (edit === 'invalid move') appStore.getState().moveReviewLine(first, 'missing');
    if (edit === 'other move') appStore.getState().moveReviewLine('new-rain', fixtureLine('rain-0'));
    if (edit === 'other removal') appStore.getState().removeReviewLine('new-rain');
    if (edit === 'invalid jump') appStore.getState().jumpToClip(-1);
    t.mock.timers.tick(799);
    assert.equal(appStore.getState().clipReview?.index, 0);
    t.mock.timers.tick(1);
    assert.equal(appStore.getState().clipReview?.index, 1);
    assert.equal(appStore.getState().playing, true);
    assert.equal(appStore.getState().clipReview?.answers[first]?.correct, true);
  } finally { detach(); }
});

test('removing an earlier clip preserves the selected review ID and does not skip its successor', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { detach } = clipTransport();
  try {
    appStore.getState().startClipReview();
    const ids = appStore.getState().clipReview!.ids;
    appStore.getState().jumpToClip(1);
    appStore.getState().answerClip(clipAnswer());
    appStore.getState().removeReviewLine(ids[0]!);
    const clip = appStore.getState().clipReview!;
    assert.equal(clip.ids[clip.index], ids[1]);
    assert.equal(clip.index, 0);
    t.mock.timers.tick(800);
    const next = appStore.getState().clipReview!;
    assert.equal(next.ids[next.index], ids[2]);
    assert.equal(appStore.getState().playing, true);
  } finally { detach(); }
});

test('editing an answered clip while another is selected clears only the edited answer', () => {
  const { detach } = clipTransport();
  try {
    appStore.getState().startClipReview();
    appStore.getState().answerClip(clipAnswer());
    appStore.getState().jumpToClip(1);
    appStore.getState().answerClip(clipAnswer());
    const second = appStore.getState().clipReview!.answers['new-rain'];
    appStore.getState().moveReviewLine('new-dawn', fixtureLine('dawn-4'));
    assert.equal(appStore.getState().clipReview?.answers['new-dawn'], undefined);
    assert.equal(appStore.getState().clipReview?.answers['new-rain'], second);
    appStore.getState().jumpToClip(0);
    appStore.getState().answerClip(clipAnswer());
    assert.equal(appStore.getState().clipReview?.answers['new-dawn']?.correct, true);
    assert.equal(appStore.getState().reviewList.find(item => item.id === 'new-dawn')?.kind, 'later');
  } finally { detach(); }
});

test('audio ending before the lyric boundary marks a clip finished and refresh seeks to its start', () => {
  const { calls, detach } = clipTransport();
  try {
    appStore.getState().startClipReview();
    const clip = appStore.getState().clipPlayback!;
    appStore.getState().updatePlayback(clip.endMs - 500, clip.endMs - 500, false);
    assert.equal(appStore.getState().clipPlayback?.ended, true);
    assert.equal(appStore.getState().playing, false);
    calls.length = 0;
    appStore.getState().setPlaying(true);
    assert.deepEqual(calls, ['pause', `seek:${clip.startMs}`, 'play']);
    assert.equal(appStore.getState().clipPlayback?.ended, false);
    assert.equal(appStore.getState().clipPlayback?.positionMs, clip.startMs);
  } finally { detach(); }
});

test('native EOF finishes a clip even when its final position is short of duration', async t => {
  const { calls, status, detach } = await nativePacingRun(t);
  try {
    appStore.setState({ reviewList: [{ id: 'native', songId: 'dawn', lineId: fixtureLine('dawn-0'), kind: 'new' }] });
    appStore.getState().startClipReview();
    status(0, false);
    await Promise.resolve();
    const clip = appStore.getState().clipPlayback!;
    appStore.setState({ clipPlayback: { ...clip, endMs: 240000 } });
    status(237990, false, true);
    assert.equal(appStore.getState().clipPlayback?.ended, true);
    assert.equal(appStore.getState().playing, false);
    assert.equal(appStore.getState().clipReview?.index, 0);
    calls.length = 0;
    appStore.getState().setPlaying(true);
    await Promise.resolve();
    assert.ok(calls.includes(`seek:${clip.startMs}`));
    assert.equal(appStore.getState().clipPlayback?.ended, false);
  } finally { detach(); }
});

test('native clip pause and resume follow lock-screen controls while seek, buffering and queued statuses remain guarded', async t => {
  const { calls, status, detach } = await nativePacingRun(t);
  try {
    appStore.setState({ reviewList: [{ id: 'native', songId: 'dawn', lineId: fixtureLine('dawn-0'), kind: 'new' }] });
    appStore.getState().startClipReview();
    status(0, false);
    assert.equal(appStore.getState().playing, true);
    await Promise.resolve();
    status(0, false, false, true);
    assert.equal(appStore.getState().playing, true);
    status(1000, true);
    status(1200, false);
    assert.equal(appStore.getState().playing, false);
    assert.equal(appStore.getState().clipPlayback?.positionMs, 1200);
    calls.length = 0;
    appStore.getState().setPlaying(true);
    assert.deepEqual(calls, ['play']);
    status(1300, true);
    appStore.getState().setPlaying(false);
    status(1350, true);
    assert.equal(appStore.getState().playing, false);
    status(1350, false);
    status(1350, true);
    assert.equal(appStore.getState().playing, true);
    assert.ok(appStore.getState().clipPlayback);
    assert.equal(appStore.getState().clipReview?.index, 0);
  } finally { detach(); }
});

for (const mode of ['quiz', 'clip'] as const) test(`${mode} review doubles intervals and a miss resets the schedule`, t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  const day = 86400000, lineId = fixtureLine('dawn-3');
  appStore.setState({ reviewList: [{ id: 'scheduled', songId: 'dawn', lineId, kind: 'new' }] });
  if (mode === 'quiz') appStore.getState().setQuizToggle(true);
  const answer = (correct: boolean) => {
    if (mode === 'quiz') {
      appStore.getState().restartRun();
      appStore.getState().jumpToLine(3);
      appStore.getState().answer(correct ? correctAnswer() : 'wrong');
    } else {
      appStore.getState().startClipReview();
      assert.deepEqual(appStore.getState().clipReview?.ids, ['scheduled']);
      appStore.getState().answerClip(correct ? clipAnswer() : 'wrong');
      appStore.getState().stopClipReview();
    }
  };
  for (let step = 0; step < 4; step++) {
    answer(true);
    const line = appStore.getState().reviewList[0]!;
    assert.equal(line.kind, 'later');
    if (line.kind !== 'later') throw new Error('Expected scheduled line');
    assert.equal(line.step, step);
    assert.equal(line.dueAt, Date.now() + 2 ** step * day);
    assert.equal(isDue(line, line.dueAt - 1), false);
    assert.equal(isDue(line, line.dueAt), true);
    t.mock.timers.setTime(line.dueAt);
  }
  answer(false);
  assert.deepEqual(appStore.getState().reviewList[0], { id: 'scheduled', songId: 'dawn', lineId, kind: 'due', misses: 1 });
  answer(false);
  const missed = appStore.getState().reviewList[0]!;
  assert.equal(missed.kind === 'due' && missed.misses, 2);
  answer(true);
  assert.deepEqual(appStore.getState().reviewList[0], { id: 'scheduled', songId: 'dawn', lineId, kind: 'later', step: 0, dueAt: Date.now() + day });
});

test('expired later lines join due today and ready review, with new lines separate', () => {
  const now = 1000;
  const list = [
    { id: 'new', songId: 'dawn', lineId: fixtureLine('dawn-0'), kind: 'new' as const },
    { id: 'due', songId: 'dawn', lineId: fixtureLine('dawn-1'), kind: 'due' as const, misses: 1 },
    { id: 'expired', songId: 'dawn', lineId: fixtureLine('dawn-2'), kind: 'later' as const, step: 2, dueAt: now },
    { id: 'future', songId: 'dawn', lineId: fixtureLine('dawn-3'), kind: 'later' as const, step: 0, dueAt: now + 1 },
  ];
  assert.deepEqual(list.map(line => isDue(line, now)), [true, true, true, false]);
  assert.deepEqual(dueLines(list, now).map(line => line.id), ['due', 'expired']);
  assert.deepEqual(readyReviewLines(list, now).map(line => line.id), ['new', 'due', 'expired']);
});

test('hydration makes legacy later lines due, stays stable across hydrations and drops obsolete review mix state', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000000 });
  const values = new Map([['learning-state', JSON.stringify({ version: 0, state: {
    reviewMix: { songIds: ['dawn'], index: 0, previousQuizToggle: false },
    reviewList: [
      { id: 'legacy', songId: 'dawn', lineId: fixtureLine('dawn-0'), kind: 'later' },
      { id: 'partial', songId: 'dawn', lineId: fixtureLine('dawn-1'), kind: 'later', step: 4 },
      { id: 'scheduled', songId: 'dawn', lineId: fixtureLine('dawn-2'), kind: 'later', step: 3, dueAt: 1234 },
      { id: 'new', songId: 'dawn', lineId: fixtureLine('dawn-3'), kind: 'new' },
      { id: 'due', songId: 'dawn', lineId: fixtureLine('dawn-4'), kind: 'due', misses: 2 },
    ],
  } })]]);
  await hydrateAppState({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } });
  const list = appStore.getState().reviewList;
  assert.deepEqual(list.slice(0, 3).map(line => line.kind === 'later' ? [line.step, line.dueAt] : null), [[0, 0], [0, 0], [3, 1234]]);
  assert.equal(list[3]!.kind, 'new');
  assert.deepEqual(list[4], { id: 'due', songId: 'dawn', lineId: fixtureLine('dawn-4'), kind: 'due', misses: 2 });
  assert.equal('reviewMix' in appStore.getState(), false);
  appStore.getState().dismissToast();
  const saved = JSON.parse(values.get('learning-state')!) as { state: Record<string, unknown> };
  assert.equal('reviewMix' in saved.state, false);
  t.mock.timers.setTime(2000000);
  await appStore.persist.rehydrate();
  assert.deepEqual(appStore.getState().reviewList, list);
});

test('a lost mark on a non-Japanese line leaves review and toast state unchanged', () => {
  const lyrics = getLyrics('dawn');
  libraryStore.getState().setLyricsResult('dawn', 'synced', { ...lyrics, lines: lyrics.lines.map(line => line.id === lyrics.timeline[5]!.lineId ? { ...line, segments: [{ text: 'English only' }] } : line) });
  appStore.getState().jumpToLine(5);
  const before = appStore.getState();
  appStore.getState().addLostMark();
  assert.equal(appStore.getState(), before);
});

test('main seek clamps, follows occurrences and leaves skipped quiz lines unanswered', () => {
  const calls: number[] = [], detach = setTransport({ load() {}, play() {}, pause() {}, seek: ms => { calls.push(ms); } });
  try {
    appStore.getState().startSong('dawn');
    appStore.getState().setQuizToggle(true);
    const duration = appStore.getState().durationMs;
    for (const position of [-100, 19000, duration + 100]) {
      appStore.getState().seek(position);
      const clamped = Math.max(0, Math.min(position, duration));
      assert.equal(appStore.getState().positionMs, clamped);
      assert.equal(calls.at(-1), clamped);
      assert.equal(appStore.getState().lineIndex, currentOccurrence(getLyrics('dawn').timeline, clamped));
    }
    assert.deepEqual(appStore.getState().run.answers, {});
    appStore.getState().jumpToLine(1);
    assert.equal(calls.at(-1), getLyrics('dawn').timeline[1]!.startMs);
  } finally { detach(); }
});

test('seeking during an answer stop releases it and seeking back permits another stop', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { calls, detach } = pacingRun(3);
  try {
    stopFirstLine();
    appStore.getState().seek(19000);
    assert.equal(appStore.getState().answerWait, null);
    assert.equal(appStore.getState().playing, true);
    assert.deepEqual(calls.slice(-2), ['seek:19000', 'play']);
    const before = [...calls];
    t.mock.timers.tick(3000);
    assert.deepEqual(calls, before);
    appStore.getState().seek(0);
    stopFirstLine();
    assert.equal(appStore.getState().answerWait?.lineIndex, 0);
    assert.deepEqual(appStore.getState().run.answers, {});
  } finally { detach(); }
});

test('Japanese visibility requires a Japanese line in scanned synced lyrics', () => {
  const japanese = { ...firstSong, id: 'japanese' }, english = { ...firstSong, id: 'english' }, missing = { ...firstSong, id: 'missing' };
  const unchecked = { ...firstSong, id: 'unchecked', lyricsStatus: 'unchecked' as const };
  const unsynced = { ...firstSong, id: 'unsynced', lyricsStatus: 'none' as const };
  const source = [english, japanese, missing, unchecked, unsynced];
  const japaneseLyrics = { songId: japanese.id, lines: [{ id: 'ja', segments: [{ text: 'Hello ' }, { text: 'こんにちは' }] }], timeline: [] };
  libraryStore.getState().setLibrary({ songs: source, albums, artists, lyrics: {
    japanese: japaneseLyrics,
    english: { songId: english.id, lines: [{ id: 'en', segments: [{ text: 'Hello' }], translation: 'こんにちは' }], timeline: [] },
    unchecked: { ...japaneseLyrics, songId: unchecked.id },
    unsynced: { ...japaneseLyrics, songId: unsynced.id },
  } });
  assert.equal(hasJapaneseLyrics(japanese.id), true);
  for (const song of [english, missing, unchecked, unsynced]) {
    assert.equal(hasJapaneseLyrics(song.id), false);
    assert.equal(isHiddenSong(song, { hideUnsynced: false, hideNonJapanese: true }), true);
  }
  assert.deepEqual(getVisibleSongs(source, { hideUnsynced: false, hideNonJapanese: false }), source);
  assert.deepEqual(getVisibleSongs(source, { hideUnsynced: true, hideNonJapanese: false }), [english, japanese, missing]);
  for (const hideUnsynced of [false, true]) {
    const filters = { hideUnsynced, hideNonJapanese: true };
    assert.deepEqual(getVisibleSongs(source, filters), [japanese]);
    assert.deepEqual(getVisibleLibrary(filters).songs, [japanese]);
    assert.deepEqual(getRecentlyPlayed(filters, 6, source), [japanese]);
  }
  libraryStore.getState().setLyricsResult(japanese.id, 'synced', { ...japaneseLyrics, lines: [] });
  assert.equal(hasJapaneseLyrics(japanese.id), false);
});

test('Japanese filtering skips non-Japanese songs in library and album queues', () => {
  const first = { ...firstSong, id: 'first' }, english = { ...firstSong, id: 'english' }, last = { ...firstSong, id: 'last' };
  const source = [first, english, last];
  libraryStore.getState().setLibrary({ songs: source, albums, artists, lyrics: Object.fromEntries(source.map(song => [song.id, {
    songId: song.id, lines: [{ id: song.id, segments: [{ text: song.id === 'english' ? 'Hello' : 'こんにちは' }] }], timeline: [],
  }])) });
  assert.equal(appStore.getState().hideSongsWithoutJapanese, true);
  appStore.setState({ hideSongsWithoutSyncedLyrics: false });
  for (const playbackQueue of [null, source.map(song => song.id)]) {
    appStore.getState().startSong(first.id);
    appStore.setState({ playbackQueue });
    appStore.getState().nextSong();
    assert.equal(appStore.getState().songId, last.id);
    appStore.getState().previousSong();
    assert.equal(appStore.getState().songId, first.id);
  }
  appStore.getState().startAlbum(first.albumId);
  assert.deepEqual(appStore.getState().playbackQueue, [first.id, last.id]);
  appStore.getState().toggleHideSongsWithoutJapanese();
  assert.equal(appStore.getState().hideSongsWithoutJapanese, false);
  appStore.getState().startAlbum(first.albumId);
  assert.deepEqual(appStore.getState().playbackQueue, source.map(song => song.id));
  appStore.getState().nextSong();
  assert.equal(appStore.getState().songId, english.id);
  const before = appStore.getState();
  appStore.getState().toggleHideSongsWithoutJapanese();
  assert.equal(appStore.getState().songId, english.id);
  assert.equal(appStore.getState().playing, before.playing);
  appStore.getState().nextSong();
  assert.equal(appStore.getState().songId, last.id);
  appStore.setState({ songId: english.id });
  appStore.getState().previousSong();
  assert.equal(appStore.getState().songId, first.id);
});

test('legacy saved state defaults the Japanese filter on', async () => {
  await hydrateAppState({ getItem: () => JSON.stringify({ state: { hideSongsWithoutSyncedLyrics: false }, version: 0 }), setItem() {}, removeItem() {} });
  assert.equal(appStore.getState().hideSongsWithoutJapanese, true);
  assert.equal(appStore.getState().hideSongsWithoutSyncedLyrics, false);
});
