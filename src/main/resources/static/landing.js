'use strict';

// Run only on landing page
document.addEventListener('DOMContentLoaded', () => {
  if (!document.body.classList.contains('landing-page')) return;
  if (!window.gsap) return;

  const gsap = window.gsap;
  if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = 'power2.out';

  // Utility: set elements visible without animation (respect reduced motion)
  function showImmediately(els) {
    els.forEach(sel => {
      gsap.set(sel, { opacity: 1, y: 0, scale: 1, clearProps: 'transform,opacity' });
    });
  }

  // HERO
  const hero = document.querySelector('.saas-hero');
  const heroTitle = document.querySelector('.saas-hero .hero-title');
  const heroSub = document.querySelector('.saas-hero .hero-subtitle');
  const heroCTAs = Array.from(document.querySelectorAll('.saas-hero .btn'));

  if (reduced) {
    showImmediately(['.saas-hero .hero-title', '.saas-hero .hero-subtitle', '.saas-hero .btn']);
  } else if (hero) {
    gsap.set([heroTitle, heroSub], { opacity: 0, y: 16 });
    gsap.set(heroCTAs, { opacity: 0, scale: 0.98 });

    const tl = gsap.timeline({ defaults: { ease } });
    tl.to(heroTitle, { opacity: 1, y: 0, duration: 0.6 })
      .to(heroSub, { opacity: 1, y: 0, duration: 0.5 }, '-=0.25')
      .to(heroCTAs, { opacity: 1, scale: 1, duration: 0.45, stagger: 0.08 }, '-=0.2');

    // Parallax on scroll
    gsap.to('.mockup-desktop', {
      y: -24,
      ease: 'none',
      scrollTrigger: { trigger: '.saas-hero', start: 'top top', end: 'bottom top', scrub: 0.2 }
    });
    gsap.to('.mockup-mobile', {
      y: -36,
      ease: 'none',
      scrollTrigger: { trigger: '.saas-hero', start: 'top top', end: 'bottom top', scrub: 0.25 }
    });
  }

  // Section reveals
  const sections = [
    { wrap: '#features', items: '#features .feature-card' },
    { wrap: '#how-it-works', items: '#how-it-works .step-card' },
    { wrap: '#testimonials', items: '#testimonials .testimonial-card' },
    { wrap: 'section.bg-primary.text-white', items: 'section.bg-primary.text-white .btn' }
  ];

  if (reduced) {
    showImmediately(sections.map(s => s.wrap));
    showImmediately(sections.map(s => s.items));
    return;
  }

  gsap.defaults({ ease, overwrite: 'auto' });
  if (window.ScrollTrigger) {
    window.ScrollTrigger.defaults({ once: true, toggleActions: 'play none none none' });
  }

  sections.forEach(({ wrap, items }) => {
    const wrapEl = document.querySelector(wrap);
    if (!wrapEl) return;

    gsap.from(wrapEl, {
      opacity: 0, y: 18, duration: 0.55,
      scrollTrigger: { trigger: wrapEl, start: 'top 80%' }
    });

    gsap.utils.toArray(items).forEach((el, i) => {
      gsap.from(el, {
        opacity: 0, y: 14, duration: 0.45, delay: i * 0.06,
        scrollTrigger: { trigger: el, start: 'top 85%' }
      });
    });
  });
});