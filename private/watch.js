/* Created only after the existing vault successfully decrypts. No password is stored. */
(() => {
  const origin = 'https://framextv.cc';
  window.PrivateWatch = {
    create() {
      const section = document.createElement('section');
      section.dataset.tab = 'Watch';
      section.innerHTML = `
        <h2>Watch</h2>
        <p>Load a movie or TV episode with its TMDB ID.</p>
        <form class="watch-form">
          <label for="watch-type">Type</label>
          <select id="watch-type" name="kind"><option value="movie">Movie</option><option value="tv">TV show</option></select>
          <label for="watch-id">TMDB ID</label>
          <input id="watch-id" name="tmdb" type="text" inputmode="numeric" pattern="[1-9][0-9]*" required placeholder="e.g. 550">
          <fieldset class="watch-episodes" hidden disabled><legend>Episode</legend>
            <label for="watch-season">Season</label><input id="watch-season" name="season" type="number" min="1" step="1" value="1" required>
            <label for="watch-episode">Episode</label><input id="watch-episode" name="episode" type="number" min="1" step="1" value="1" required>
          </fieldset>
          <label for="watch-start">Start at (seconds)</label><input id="watch-start" name="start" type="number" min="0" step="1" value="0" required>
          <label for="watch-speed">Playback speed</label><select id="watch-speed" name="speed"><option>0.5</option><option selected>1</option><option>1.25</option><option>1.5</option><option>2</option></select>
          <label><input name="muted" type="checkbox"> Start muted</label>
          <div class="watch-actions"><button class="btn solid" type="submit">Load player</button><button class="btn" type="button" data-stop>Close player</button></div>
        </form>
        <p class="watch-direct" hidden><a class="btn" target="_blank" rel="noopener noreferrer">Open in new tab</a></p>
        <p class="watch-status" role="status" aria-live="polite">Choose a title to begin. Playback is provided by FrameXTV.</p>
        <iframe class="watch-player" title="FrameXTV video player" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="no-referrer" hidden></iframe>`;
      const form = section.querySelector('form');
      const player = section.querySelector('iframe');
      const direct = section.querySelector('.watch-direct');
      const directLink = direct.querySelector('a');
      const status = section.querySelector('.watch-status');
      form.elements.kind.addEventListener('change', () => {
        const episodes = section.querySelector('fieldset');
        episodes.hidden = episodes.disabled = form.elements.kind.value !== 'tv';
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const fields = form.elements;
        const parts = [fields.tmdb.value.trim()];
        if (fields.kind.value === 'tv') parts.push(fields.season.value, fields.episode.value);
        if (!parts.every(part => /^[1-9][0-9]*$/.test(part))) return;
        const url = new URL('/embed/' + parts.join('/'), origin);
        url.search = new URLSearchParams({ autoplay: '0', muted: fields.muted.checked ? '1' : '0', start: fields.start.value, speed: fields.speed.value, controls: '1' });
        player.src = url.href;
        player.hidden = false;
        directLink.href = url.href;
        direct.hidden = false;
        status.textContent = 'If the embedded player is blocked, use Open in new tab.';
      });
      section.querySelector('[data-stop]').addEventListener('click', () => {
        player.removeAttribute('src');
        player.hidden = true;
        directLink.removeAttribute('href');
        direct.hidden = true;
        status.textContent = 'Player closed.';
      });
      return section;
    }
  };
})();
