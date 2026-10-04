import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { appStore, getRunSummary } from '../src/store/appStore';
import { albums, artists, firstSong, getAlbumSongs, getArtistAlbums, getLineText, songs } from '../src/data/fakeData';
import { albumHasSyncedLyrics, artistHasSyncedLyrics, getRecentlyPlayed, getReviewMixProgress, getVisibleLibrary, getVisibleSongs } from '../src/data/libraryVisibility';

const initialState = appStore.getState();
beforeEach(() => appStore.setState(initialState, true));

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
  appStore.getState().moveReviewLine('new-dawn', 'dawn-4');
  assert.equal(appStore.getState().reviewList.find(line => line.id === 'new-dawn')?.lineId, 'dawn-4');
  appStore.getState().removeReviewLine('new-dawn');
  assert.ok(!appStore.getState().reviewList.some(line => line.id === 'new-dawn'));
  assert.equal(appStore.getState().clipReview?.ids[0], 'new-rain');
});

test('three hits build a headbang combo and a miss resets it without completing due lines', () => {
  appStore.getState().setQuizToggle(true);
  for (let index = 0; index < 3; index++) {
    appStore.getState().answer(1);
    // A second tap during feedback must not count twice.
    appStore.getState().answer(1);
    assert.equal(appStore.getState().run.combo, index + 1);
    appStore.getState().advanceLine();
  }
  assert.equal(appStore.getState().run.combo, 3);
  appStore.getState().answer(0);
  assert.equal(appStore.getState().run.combo, 0);
  assert.equal(appStore.getState().run.bestCombo, 3);
  assert.ok(appStore.getState().reviewList.some(line => line.lineId === 'glass-6' && line.kind === 'due'));
});

test('clip review is untimed and moves answered new lines onto the later schedule', () => {
  appStore.getState().startClipReview();
  appStore.getState().answerClip(1);
  assert.equal(appStore.getState().reviewList.find(line => line.id === 'new-dawn')?.kind, 'later');
  assert.equal(appStore.getState().clipReview?.index, 0);
  appStore.getState().nextClip();
  assert.equal(appStore.getState().clipReview?.index, 1);
  assert.equal(appStore.getState().clipReview?.answered, null);
  appStore.getState().answerClip(0);
  assert.equal(appStore.getState().reviewList.find(line => line.id === 'new-rain')?.kind, 'due');
});

test('turning off a review mix preserves unanswered lines and restores the prior setting at the end', () => {
  const before = appStore.getState().reviewList;
  appStore.getState().startReviewMix();
  assert.equal(appStore.getState().quizToggle, true);
  assert.equal(appStore.getState().reviewMix?.songIds.length, 6);
  appStore.getState().restartRun();
  assert.equal(appStore.getState().reviewMix?.songIds.length, 6);
  appStore.getState().setQuizToggle(false);
  assert.deepEqual(appStore.getState().reviewList, before);
  for (let index = 0; index < 6; index++) appStore.getState().nextSong();
  assert.equal(appStore.getState().reviewMix, null);
  assert.equal(appStore.getState().quizToggle, false);
});

test('a full run finishes and only selected misses are sent to review', () => {
  appStore.getState().setQuizToggle(true);
  appStore.getState().jumpToLine(0);
  for (let index = 0; index < firstSong.lines.length; index++) {
    appStore.getState().answer(index === 0 ? 0 : 1);
    appStore.getState().advanceLine();
  }
  assert.equal(appStore.getState().run.finished, true);
  assert.equal(Object.keys(appStore.getState().run.answers).length, 14);
  const missed = firstSong.lines[0]!.id;
  assert.ok(!appStore.getState().reviewList.some(line => line.lineId === missed));
  appStore.getState().sendToReview(missed, true);
  assert.ok(appStore.getState().reviewList.some(line => line.lineId === missed));
  appStore.getState().sendToReview(missed, false);
  assert.ok(!appStore.getState().reviewList.some(line => line.lineId === missed));
});

test('the empty-home fixture disables both review entry points', () => {
  appStore.getState().toggleNothingDue();
  assert.equal(appStore.getState().nothingDue, true);
  appStore.getState().startReviewMix();
  assert.equal(appStore.getState().reviewMix, null);
  appStore.getState().startClipReview();
  assert.deepEqual(appStore.getState().clipReview?.ids, []);
});

test('choosing a recent song or restarting a mix preserves the original quiz preference', () => {
  appStore.getState().startReviewMix();
  appStore.getState().startReviewMix();
  assert.equal(appStore.getState().reviewMix?.previousQuizToggle, false);
  appStore.getState().startSong('rain');
  assert.equal(appStore.getState().reviewMix, null);
  assert.equal(appStore.getState().quizToggle, false);
  assert.equal(appStore.getState().mode, 'listen');
});

test('moving a lost mark frees its line without reusing the entry id', () => {
  appStore.getState().jumpToLine(5);
  appStore.getState().addLostMark();
  const firstId = appStore.getState().addedId!;
  appStore.getState().moveReviewLine(firstId, 'dawn-4');
  appStore.getState().addLostMark();
  const secondId = appStore.getState().addedId!;
  assert.notEqual(firstId, secondId);
  appStore.getState().undoLostMark();
  assert.equal(appStore.getState().reviewList.find(line => line.id === firstId)?.lineId, 'dawn-4');
  assert.ok(!appStore.getState().reviewList.some(line => line.id === secondId));
  appStore.getState().addLostMark();
  const thirdId = appStore.getState().addedId!;
  appStore.getState().removeReviewLine(firstId);
  assert.ok(appStore.getState().reviewList.some(line => line.id === thirdId));
});

test('moving an answered current clip resets it to new and permits another answer', () => {
  appStore.getState().startClipReview();
  appStore.getState().answerClip(1);
  appStore.getState().moveReviewLine('new-dawn', 'dawn-4');
  assert.equal(appStore.getState().reviewList.find(line => line.id === 'new-dawn')?.kind, 'new');
  assert.equal(appStore.getState().clipReview?.answered, null);
  appStore.getState().answerClip(0);
  assert.equal(appStore.getState().clipReview?.answered, false);
  assert.equal(appStore.getState().reviewList.find(line => line.id === 'new-dawn')?.kind, 'due');
  appStore.getState().moveReviewLine('new-dawn', 'dawn-5');
  assert.equal(appStore.getState().reviewList.find(line => line.id === 'new-dawn')?.kind, 'new');
  assert.equal(appStore.getState().clipReview?.answered, null);
});

test('revisiting hits and misses preserves their recorded choice and cannot rescore', () => {
  appStore.getState().setQuizToggle(true);
  appStore.getState().jumpToLine(0);
  appStore.getState().answer(2);
  const miss = appStore.getState().run.answers['dawn-0'];
  assert.deepEqual(miss, { choice: 2, correct: false });
  appStore.getState().jumpToLine(1);
  appStore.getState().answer(1);
  const hit = appStore.getState().run.answers['dawn-1'];
  assert.deepEqual(hit, { choice: 1, correct: true });
  appStore.getState().jumpToLine(0);
  appStore.getState().answer(1);
  assert.deepEqual(appStore.getState().run.answers['dawn-0'], miss);
  assert.equal(appStore.getState().run.combo, 1);
  appStore.getState().jumpToLine(1);
  appStore.getState().answer(0);
  assert.deepEqual(appStore.getState().run.answers['dawn-1'], hit);
  assert.equal(appStore.getState().run.combo, 1);
  assert.equal(appStore.getState().run.bestCombo, 1);
  appStore.getState().restartRun();
  appStore.getState().answer(1);
  assert.equal(appStore.getState().run.combo, 1);
});

test('moving onto another review entry is rejected, including later lines', () => {
  appStore.getState().startClipReview();
  appStore.getState().answerClip(1);
  const before = appStore.getState();
  appStore.getState().moveReviewLine('new-dawn', 'dawn-2');
  assert.deepEqual(appStore.getState().reviewList, before.reviewList);
  assert.deepEqual(appStore.getState().clipReview, before.clipReview);
  appStore.getState().moveReviewLine('new-dawn', 'dawn-8');
  assert.deepEqual(appStore.getState().reviewList, before.reviewList);
  appStore.getState().moveReviewLine('new-dawn', 'dawn-3');
  assert.deepEqual(appStore.getState().reviewList, before.reviewList);
  assert.equal(appStore.getState().clipReview?.answered, true);
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
  appStore.getState().jumpToLine(firstSong.lines.length - 1);
  appStore.getState().answer(1);
  appStore.getState().advanceLine();
  const summary = getRunSummary(firstSong, appStore.getState().run);
  assert.equal(appStore.getState().run.finished, true);
  assert.equal(summary.hits, 1);
  assert.equal(summary.total, 14);
  assert.equal(summary.rank, 'C');
  assert.equal(summary.missed.length, 13);
  appStore.getState().restartRun();
  for (let index = 0; index < firstSong.lines.length; index++) {
    appStore.getState().answer(1);
    appStore.getState().advanceLine();
  }
  assert.equal(getRunSummary(firstSong, appStore.getState().run).rank, 'S');
});


test('result entry ids also survive moving and adding the original line again', () => {
  appStore.getState().sendToReview('dawn-0', true);
  const firstId = appStore.getState().reviewList.find(line => line.lineId === 'dawn-0')!.id;
  appStore.getState().moveReviewLine(firstId, 'dawn-1');
  appStore.getState().sendToReview('dawn-0', true);
  const secondId = appStore.getState().reviewList.find(line => line.lineId === 'dawn-0')!.id;
  assert.notEqual(firstId, secondId);
  appStore.getState().sendToReview('dawn-0', false);
  assert.ok(appStore.getState().reviewList.some(line => line.id === firstId));
  assert.ok(!appStore.getState().reviewList.some(line => line.id === secondId));
});

test('moving another clip preserves the current answer', () => {
  appStore.getState().startClipReview();
  appStore.getState().answerClip(1);
  appStore.getState().moveReviewLine('new-rain', 'rain-4');
  assert.equal(appStore.getState().clipReview?.answered, true);
  assert.equal(appStore.getState().reviewList.find(line => line.id === 'new-rain')?.kind, 'new');
});

test('song fixtures own their lyrics and review fixtures have distinct valid lines', () => {
  const umbrella = '傘の下で 君は何も言わなかった';
  assert.ok(!firstSong.lines.some(line => getLineText(line) === umbrella));
  assert.ok(songs.find(song => song.id === 'rain')!.lines.some(line => getLineText(line) === umbrella));
  const texts = songs.flatMap(song => song.lines.map(getLineText));
  assert.equal(new Set(texts).size, texts.length);
  const review = appStore.getState().reviewList;
  assert.equal(new Set(review.map(line => line.lineId)).size, review.length);
  for (const entry of review) assert.ok(songs.find(song => song.id === entry.songId)!.lines.some(line => line.id === entry.lineId));
});


test('albums group multiple songs in order without changing the original fixtures', () => {
  assert.deepEqual(songs.slice(0, 6).map(song => song.id), ['dawn', 'glass', 'rain', 'dream', 'bluebird', 'summer']);
  assert.equal(firstSong.duration, 238);
  assert.equal(new Set(songs.filter(song => song.hasLyrics).map(song => song.duration)).size, 6);
  assert.equal(new Set(songs.map(song => song.id)).size, songs.length);
  assert.equal(new Set(albums.map(album => album.id)).size, albums.length);
  for (const album of albums) {
    const grouped = getAlbumSongs(album.id);
    assert.ok(grouped.length >= (album.id === 'tide' ? 1 : 3));
    assert.equal(grouped[0]!.id, album.id);
    assert.ok(grouped.every(song => song.album === album.title && song.artistId === album.artistId));
    assert.ok(grouped.every(song => song.duration > 0 && song.hasLyrics === (song.lines.length > 0)));
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
  const song = songs.find(song => !song.hasLyrics)!;
  for (const quiz of [false, true]) {
    appStore.getState().setQuizToggle(quiz);
    appStore.getState().startSong(song.id);
    assert.equal(appStore.getState().songId, song.id);
    assert.equal(appStore.getState().playing, true);
    assert.equal(appStore.getState().lineIndex, 0);
    assert.equal(appStore.getState().quizToggle, quiz);
    const before = appStore.getState().reviewList;
    appStore.getState().jumpToLine(-1);
    appStore.getState().jumpToLine(100);
    appStore.getState().answer(1);
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
  const all = getVisibleLibrary(false);
  assert.deepEqual(all, { songs, albums, artists });
  const visible = getVisibleLibrary(true);
  assert.equal(visible.songs.length, 6);
  assert.ok(visible.songs.every(song => song.hasLyrics && song.lines.length));
  assert.equal(visible.albums.length, 6);
  assert.equal(visible.artists.length, 3);
  assert.equal(getVisibleSongs(getAlbumSongs('dawn'), true).length, 1);
  assert.equal(getVisibleSongs(getAlbumSongs('dawn'), false).length, 4);
  // The only deep-sea album loses synced lyrics, hiding its artist as well.
  const source = { songs: songs.map(song => song.id === 'rain' ? { ...song, hasLyrics: false, lines: [] } : song), albums, artists };
  const hidden = getVisibleLibrary(true, source);
  assert.ok(!hidden.albums.some(album => album.id === 'rain'));
  assert.ok(!hidden.artists.some(artist => artist.id === 'deep-sea'));
  assert.equal(hidden.artists.length, 2);
  assert.equal(getVisibleLibrary(false, source).albums.length, albums.length);
  assert.equal(getVisibleLibrary(false, source).artists.length, artists.length);
  // A mixed artist stays visible when one of its albums is hidden.
  source.songs = source.songs.map(song => song.id === 'dawn' ? { ...song, hasLyrics: false, lines: [] } : song);
  const mixed = getVisibleLibrary(true, source);
  assert.ok(!mixed.albums.some(album => album.id === 'dawn'));
  assert.ok(mixed.artists.some(artist => artist.id === 'minami'));
  assert.deepEqual(getVisibleLibrary(true, { songs: [], albums: [], artists: [] }), { songs: [], albums: [], artists: [] });
});

test('album and artist badges distinguish mixed, lyric-only and no-lyrics collections', () => {
  assert.equal(albumHasSyncedLyrics('dawn'), true);
  assert.equal(artistHasSyncedLyrics('minami'), true);
  assert.equal(albumHasSyncedLyrics('dawn', [firstSong]), true);
  assert.equal(artistHasSyncedLyrics('minami', [firstSong]), true);
  assert.equal(albumHasSyncedLyrics('tide'), false);
  assert.equal(artistHasSyncedLyrics('nagi'), false);
  assert.equal(albumHasSyncedLyrics('dawn', getAlbumSongs('dawn').slice(1)), false);
  assert.equal(artistHasSyncedLyrics('minami', songs.filter(song => !song.hasLyrics)), false);
  assert.equal(albumHasSyncedLyrics('dawn', []), false);
  assert.equal(artistHasSyncedLyrics('minami', []), false);
  assert.equal(albumHasSyncedLyrics('missing'), false);
  assert.equal(artistHasSyncedLyrics('missing'), false);
  assert.ok(getVisibleLibrary(false).albums.some(album => album.id === 'tide'));
  assert.ok(getVisibleLibrary(false).artists.some(artist => artist.id === 'nagi'));
  assert.ok(!getVisibleLibrary(true).albums.some(album => album.id === 'tide'));
  assert.ok(!getVisibleLibrary(true).artists.some(artist => artist.id === 'nagi'));
});

test('Recently played leaves out hidden songs and preserves visible order', () => {
  const recent = [songs[6]!, firstSong, songs[7]!, songs[1]!];
  assert.deepEqual(getRecentlyPlayed(true, 3, recent).map(song => song.id), ['dawn', 'glass']);
  assert.deepEqual(getRecentlyPlayed(false, 3, recent), recent.slice(0, 3));
});

test('search does not reveal a hidden-only match until hiding is turned off', () => {
  const song = songs.find(song => !song.hasLyrics)!;
  const source = { songs: [song], albums: albums.filter(album => album.id === song.albumId), artists: artists.filter(artist => artist.id === song.artistId) };
  assert.deepEqual(getVisibleLibrary(true, source), { songs: [], albums: [], artists: [] });
  assert.deepEqual(getVisibleLibrary(false, source), source);
});

test('the default-on global setting toggles without interrupting the current hidden song', () => {
  assert.equal(appStore.getState().hideSongsWithoutSyncedLyrics, true);
  appStore.getState().toggleHideSongsWithoutSyncedLyrics();
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
  appStore.getState().nextSong();
  assert.equal(appStore.getState().songId, songs[6]!.id);
  appStore.getState().previousSong();
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

test('review mixes skip hidden songs at creation and after the setting changes', () => {
  const hiddenSong = songs[6]!;
  appStore.setState({ reviewList: [...appStore.getState().reviewList, { id: 'empty', songId: hiddenSong.id, lineId: 'empty-line', kind: 'due', misses: 1 }] });
  appStore.getState().startReviewMix();
  assert.ok(!appStore.getState().reviewMix!.songIds.includes(hiddenSong.id));
  appStore.getState().finishReviewMix();
  appStore.getState().toggleHideSongsWithoutSyncedLyrics();
  appStore.getState().startReviewMix();
  assert.ok(appStore.getState().reviewMix!.songIds.includes(hiddenSong.id));
  const mix = appStore.getState().reviewMix!;
  appStore.setState({ reviewMix: { ...mix, songIds: ['dawn', hiddenSong.id, 'rain'] } });
  const progress = () => getReviewMixProgress(appStore.getState().reviewMix!, appStore.getState().hideSongsWithoutSyncedLyrics);
  assert.deepEqual(progress(), { position: 1, total: 3 });
  const reviewList = appStore.getState().reviewList;
  appStore.getState().toggleHideSongsWithoutSyncedLyrics();
  assert.deepEqual(progress(), { position: 1, total: 2 });
  appStore.getState().nextSong();
  assert.equal(appStore.getState().songId, 'rain');
  assert.equal(appStore.getState().reviewMix?.index, 2);
  assert.deepEqual(progress(), { position: 2, total: 2 });
  appStore.getState().toggleHideSongsWithoutSyncedLyrics();
  assert.deepEqual(progress(), { position: 3, total: 3 });
  assert.equal(appStore.getState().reviewMix?.index, 2);
  appStore.getState().toggleHideSongsWithoutSyncedLyrics();
  assert.deepEqual(progress(), { position: 2, total: 2 });
  appStore.getState().previousSong();
  assert.equal(appStore.getState().songId, 'dawn');
  assert.equal(appStore.getState().reviewMix?.index, 0);
  assert.deepEqual(progress(), { position: 1, total: 2 });
  appStore.getState().previousSong();
  assert.equal(appStore.getState().songId, 'dawn');
  appStore.getState().nextSong();
  appStore.getState().nextSong();
  assert.equal(appStore.getState().reviewMix, null);
  assert.equal(appStore.getState().quizToggle, false);
  assert.deepEqual(appStore.getState().reviewList, reviewList);
});

test('no-lyrics playback stays on the current song until the user skips', () => {
  appStore.getState().toggleHideSongsWithoutSyncedLyrics();
  const song = songs[6]!;
  for (const quiz of [false, true]) {
    appStore.getState().setQuizToggle(quiz);
    appStore.getState().startSong(song.id);
    appStore.getState().advancePlayback();
    appStore.getState().setPlaying(false);
    appStore.getState().advancePlayback();
    appStore.getState().setPlaying(true);
    appStore.getState().advancePlayback();
    assert.equal(appStore.getState().songId, song.id);
    assert.equal(appStore.getState().run.finished, false);
    assert.deepEqual(appStore.getState().run.answers, {});
    appStore.getState().nextSong();
    assert.notEqual(appStore.getState().songId, song.id);
  }
});

test('timed lyric playback advances in listen mode and leaves quiz progression to answers', () => {
  appStore.getState().startSong(firstSong.id);
  appStore.getState().advancePlayback();
  assert.equal(appStore.getState().lineIndex, 1);
  appStore.getState().setPlaying(false);
  appStore.getState().advancePlayback();
  assert.equal(appStore.getState().lineIndex, 1);
  appStore.getState().setPlaying(true);
  appStore.getState().setQuizToggle(true);
  appStore.getState().advancePlayback();
  assert.equal(appStore.getState().lineIndex, 1);
  appStore.getState().setQuizToggle(false);
  appStore.getState().jumpToLine(firstSong.lines.length - 1);
  appStore.getState().advancePlayback();
  assert.equal(appStore.getState().songId, 'glass');
  assert.equal(appStore.getState().run.finished, false);
  const lastSyncedSong = songs[5]!;
  appStore.getState().startSong(lastSyncedSong.id);
  appStore.getState().jumpToLine(lastSyncedSong.lines.length - 1);
  appStore.getState().advancePlayback();
  assert.equal(appStore.getState().songId, 'dawn');
  appStore.getState().toggleHideSongsWithoutSyncedLyrics();
  appStore.getState().startSong(lastSyncedSong.id);
  appStore.getState().jumpToLine(lastSyncedSong.lines.length - 1);
  appStore.getState().advancePlayback();
  assert.equal(appStore.getState().songId, songs[6]!.id);
});
