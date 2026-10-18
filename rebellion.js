const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Make the preserved Pricepad shell usable without its old market modules.
const reveal = () => {
  $$('[data-reveal]').forEach((el) => el.classList.add('in-view'));
};
if (reduced) reveal();
else {
  const io = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) { entry.target.classList.add('in-view'); io.unobserve(entry.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  $$('[data-reveal]').forEach((el) => io.observe(el));
  setTimeout(reveal, 1800);
}

const START = Date.UTC(2025, 6, 10, 0, 0, 0);
function paintClock() {
  const elapsed = Math.max(0, Date.now() - START);
  const days = Math.floor(elapsed / 864e5);
  const hours = Math.floor(elapsed / 36e5) % 24;
  const minutes = Math.floor(elapsed / 6e4) % 60;
  const seconds = Math.floor(elapsed / 1000) % 60;
  if ($('#cdD')) $('#cdD').textContent = String(days).padStart(3, '0');
  if ($('#cdH')) $('#cdH').textContent = String(hours).padStart(2, '0');
  if ($('#cdM')) $('#cdM').textContent = String(minutes).padStart(2, '0');
  if ($('#cdS')) $('#cdS').textContent = String(seconds).padStart(2, '0');
  if ($('#clockYears')) $('#clockYears').textContent = `${days} days, ${hours} hours, ${minutes} minutes, ${seconds} seconds`;
}
paintClock();
setInterval(paintClock, 1000);

const petitionKey = 'rebellion-signatures';
const getSignatures = () => JSON.parse(localStorage.getItem(petitionKey) || '[]');
const paintSignatures = () => { if ($('#petitionCount')) $('#petitionCount').textContent = getSignatures().length; };
const form = $('#petitionForm');
if (form) form.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('#petitionName');
  const status = $('#petitionStatus');
  const value = input.value.trim();
  if (!value) return;
  const signatures = getSignatures();
  if (!signatures.some((name) => name.toLowerCase() === value.toLowerCase())) signatures.push(value);
  localStorage.setItem(petitionKey, JSON.stringify(signatures));
  input.value = '';
  status.textContent = "Your signature is on this device's petition record.";
  paintSignatures();
});
paintSignatures();

$$('[data-addr]').forEach((el) => el.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(el.dataset.addr); } catch {}
  const copy = el.querySelector('.do');
  if (copy) { copy.textContent = 'copied'; setTimeout(() => { copy.textContent = 'copy'; }, 1600); }
}));

for (const link of $$('a[href^="#"]')) link.addEventListener('click', (event) => {
  const target = document.getElementById(link.getAttribute('href').slice(1));
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
});

const words = ['coming soon.', 'still waiting.', 'answer us.'];
const word = $('#word');
if (word && !reduced) {
  let i = 0;
  setInterval(() => {
    word.classList.add('out');
    setTimeout(() => { i = (i + 1) % words.length; word.textContent = words[i]; word.classList.remove('out'); }, 350);
  }, 2600);
}
