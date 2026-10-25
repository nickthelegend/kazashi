import '@fontsource/bricolage-grotesque/600.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/anonymous-pro/400.css';
import '@fontsource/anonymous-pro/700.css';
import './style.css';

function hero(): void {
  const video = (document.getElementById('hero-clip') ?? document.querySelector('video')) as HTMLVideoElement | null;
  if (!video) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Static under reduced motion: controls visible, no autoplay.
    video.controls = true;
    return;
  }
  video.play().catch(() => {
    video.controls = true;
  });
}

hero();
