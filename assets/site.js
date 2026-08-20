const header = document.querySelector('[data-header]');
const menu = document.querySelector('[data-menu]');
const menuToggle = document.querySelector('[data-menu-toggle]');

function updateHeader() {
  header?.classList.toggle('is-sticky', window.scrollY > 36);
}

updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

menuToggle?.addEventListener('click', () => {
  const open = menu?.classList.toggle('is-open') ?? false;
  menuToggle.setAttribute('aria-expanded', String(open));
  document.body.style.overflow = open ? 'hidden' : '';
});

menu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  menu.classList.remove('is-open');
  menuToggle?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}));

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const reveals = document.querySelectorAll('.reveal');
if (reduceMotion || !('IntersectionObserver' in window)) {
  reveals.forEach((element) => element.classList.add('is-visible'));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  reveals.forEach((element) => observer.observe(element));
}

const lightbox = document.querySelector('[data-lightbox]');
const galleryItems = [...document.querySelectorAll('[data-gallery-item]')];
if (lightbox && galleryItems.length) {
  const image = lightbox.querySelector('[data-lightbox-image]');
  const caption = lightbox.querySelector('[data-lightbox-caption]');
  let activeIndex = 0;

  const showImage = (index) => {
    activeIndex = (index + galleryItems.length) % galleryItems.length;
    const item = galleryItems[activeIndex];
    image.src = item.dataset.src;
    image.alt = item.dataset.alt;
    caption.textContent = `${activeIndex + 1} / ${galleryItems.length} — ${item.dataset.alt}`;
  };

  galleryItems.forEach((item, index) => item.addEventListener('click', () => {
    showImage(index);
    lightbox.showModal();
  }));
  lightbox.querySelector('[data-lightbox-close]')?.addEventListener('click', () => lightbox.close());
  lightbox.querySelector('[data-lightbox-prev]')?.addEventListener('click', () => showImage(activeIndex - 1));
  lightbox.querySelector('[data-lightbox-next]')?.addEventListener('click', () => showImage(activeIndex + 1));
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) lightbox.close();
  });
  lightbox.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') showImage(activeIndex - 1);
    if (event.key === 'ArrowRight') showImage(activeIndex + 1);
  });
}
