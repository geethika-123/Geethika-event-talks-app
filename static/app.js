// Global State
let allNotes = [];
let filteredNotes = [];
let activeCategory = 'all';
let searchQuery = '';
let lastCheckedTime = null;

// DOM Elements
const refreshBtn = document.getElementById('refreshBtn');
const refreshSpinner = document.getElementById('refreshSpinner');
const searchInput = document.getElementById('searchInput');
const categoryFilters = document.getElementById('categoryFilters');
const cardsGrid = document.getElementById('cardsGrid');
const skeletonFeed = document.getElementById('skeletonFeed');
const emptyState = document.getElementById('emptyState');
const totalCount = document.getElementById('totalCount');
const lastSyncTime = document.getElementById('lastSyncTime');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIconSun = themeToggleBtn.querySelector('.theme-icon-sun');
const themeIconMoon = themeToggleBtn.querySelector('.theme-icon-moon');

// Dialog Elements
const tweetDialog = document.getElementById('tweetDialog');
const closeDialogBtn = document.getElementById('closeDialogBtn');
const tweetContent = document.getElementById('tweetContent');
const charCount = document.getElementById('charCount');
const charProgressCircle = document.getElementById('charProgressCircle');
const charProgressSvg = charProgressCircle.closest('svg');
const mockTweetBtn = document.getElementById('mockTweetBtn');
const realTweetLink = document.getElementById('realTweetLink');
const snippetBox = document.getElementById('snippetBox');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initializeTheme();
  fetchReleaseNotes();
});

// Theme Initialization
function initializeTheme() {
  const isLightMode = document.documentElement.classList.contains('light-theme');
  updateThemeIcons(isLightMode);
}

function updateThemeIcons(isLight) {
  if (isLight) {
    themeIconSun.style.display = 'none';
    themeIconMoon.style.display = 'block';
  } else {
    themeIconSun.style.display = 'block';
    themeIconMoon.style.display = 'none';
  }
}

// Event Listeners
function setupEventListeners() {
  refreshBtn.addEventListener('click', fetchReleaseNotes);
  
  // Theme Toggle Listener
  themeToggleBtn.addEventListener('click', () => {
    const isLight = document.documentElement.classList.toggle('light-theme');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    updateThemeIcons(isLight);
    showToast(isLight ? "Switched to Light Mode ☀️" : "Switched to Dark Mode 🌙");
  });
  
  // Search with debounce
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchQuery = e.target.value.toLowerCase().trim();
      applyFilters();
    }, 250);
  });
  
  // Dialog close
  closeDialogBtn.addEventListener('click', () => {
    tweetDialog.close();
  });
  
  // Tweet content input listener
  tweetContent.addEventListener('input', updateCharCounter);
  
  // Real Tweet Click
  realTweetLink.addEventListener('click', (e) => {
    // Show toast for redirect
    showToast("Opening Twitter (X) Web Intent...");
    tweetDialog.close();
  });
  
  // Mock Tweet
  mockTweetBtn.addEventListener('click', () => {
    showToast("🎉 Mock Tweet posted successfully! (Simulated)");
    tweetDialog.close();
  });
  
  // Light-dismiss dialog fallback for browsers without native support
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    tweetDialog.addEventListener('click', (event) => {
      if (event.target !== tweetDialog) return;
      
      const rect = tweetDialog.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width
      );
      
      if (isDialogContent) return;
      tweetDialog.close();
    });
  }
}

// Fetch notes from Flask backend
async function fetchReleaseNotes() {
  setLoadingState(true);
  
  try {
    const response = await fetch('/api/releases');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    if (data.status === 'success') {
      processFeedEntries(data.entries);
      lastCheckedTime = new Date();
      updateMetadata();
      applyFilters();
      showToast("Release notes synchronized successfully.");
    } else {
      throw new Error(data.message || "Unknown error occurred.");
    }
  } catch (error) {
    console.error("Error fetching release notes:", error);
    showToast(`Failed to sync notes: ${error.message}`);
    
    // If we have no notes, show empty state
    if (allNotes.length === 0) {
      skeletonFeed.style.display = 'none';
      emptyState.style.display = 'flex';
    }
  } finally {
    setLoadingState(false);
  }
}

// Process entries and split multiple updates within the same entry
function processFeedEntries(entries) {
  const parsedItems = [];
  
  entries.forEach(entry => {
    const splitNotes = parseEntryContent(entry);
    parsedItems.push(...splitNotes);
  });
  
  allNotes = parsedItems;
}

// Parse entry HTML and segment by H3 categories
function parseEntryContent(entry) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(entry.content, 'text/html');
  const items = [];
  
  let currentCategory = 'Update';
  let tempDiv = document.createElement('div');
  let currentId = 0;
  
  const children = Array.from(doc.body.children);
  
  if (children.length === 0) {
    items.push({
      id: `${entry.id}-0`,
      date: entry.title,
      category: 'Update',
      content: entry.content,
      link: entry.link
    });
    return items;
  }
  
  for (let child of children) {
    if (child.tagName === 'H3') {
      if (tempDiv.innerHTML.trim() !== '') {
        items.push({
          id: `${entry.id}-${currentId++}`,
          date: entry.title,
          category: normalizeCategory(currentCategory),
          content: tempDiv.innerHTML,
          link: entry.link
        });
        tempDiv = document.createElement('div');
      }
      currentCategory = child.textContent.trim();
    } else {
      tempDiv.appendChild(child.cloneNode(true));
    }
  }
  
  if (tempDiv.innerHTML.trim() !== '') {
    items.push({
      id: `${entry.id}-${currentId++}`,
      date: entry.title,
      category: normalizeCategory(currentCategory),
      content: tempDiv.innerHTML,
      link: entry.link
    });
  } else if (items.length === 0) {
    items.push({
      id: `${entry.id}-fallback`,
      date: entry.title,
      category: normalizeCategory(currentCategory),
      content: entry.content,
      link: entry.link
    });
  }
  
  return items;
}

// Map various category strings to normalized types
function normalizeCategory(cat) {
  const clean = cat.toLowerCase().trim();
  if (clean.includes('feature') || clean.includes('new')) return 'Feature';
  if (clean.includes('deprecation') || clean.includes('deprecated')) return 'Deprecation';
  if (clean.includes('announcement') || clean.includes('info')) return 'Announcement';
  if (clean.includes('bug') || clean.includes('fix') || clean.includes('resolved')) return 'Bug Fix';
  return 'Update';
}

// Update Counts & Metadata Panel
function updateMetadata() {
  totalCount.textContent = allNotes.length;
  
  if (lastCheckedTime) {
    const hrs = String(lastCheckedTime.getHours()).padStart(2, '0');
    const mins = String(lastCheckedTime.getMinutes()).padStart(2, '0');
    lastSyncTime.textContent = `Today at ${hrs}:${mins}`;
  }
  
  // Re-generate category filters based on current items
  renderCategoryFilters();
}

// Render dynamic filters based on actual category distribution
function renderCategoryFilters() {
  // Compute counts
  const counts = {
    all: allNotes.length,
    'Feature': 0,
    'Announcement': 0,
    'Deprecation': 0,
    'Bug Fix': 0,
    'Update': 0
  };
  
  allNotes.forEach(note => {
    if (counts[note.category] !== undefined) {
      counts[note.category]++;
    } else {
      counts['Update']++;
    }
  });
  
  // Render
  categoryFilters.innerHTML = '';
  
  const categoriesToRender = [
    { id: 'all', label: 'All Updates', dot: 'dot-all' },
    { id: 'Feature', label: 'Features', dot: 'dot-feature' },
    { id: 'Announcement', label: 'Announcements', dot: 'dot-announcement' },
    { id: 'Deprecation', label: 'Deprecations', dot: 'dot-deprecation' },
    { id: 'Bug Fix', label: 'Bug Fixes', dot: 'dot-bugfix' },
    { id: 'Update', label: 'General Updates', dot: 'dot-other' }
  ];
  
  categoriesToRender.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `filter-btn ${activeCategory === cat.id ? 'active' : ''}`;
    btn.setAttribute('data-category', cat.id);
    btn.setAttribute('id', `filter-${cat.id.toLowerCase().replace(' ', '-')}`);
    
    btn.innerHTML = `
      <span class="category-dot ${cat.dot}"></span>
      <span class="filter-name">${cat.label}</span>
      <span class="filter-count">${counts[cat.id] || 0}</span>
    `;
    
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = cat.id;
      applyFilters();
    });
    
    categoryFilters.appendChild(btn);
  });
}

// Filter and search application logic
function applyFilters() {
  filteredNotes = allNotes.filter(note => {
    const matchesCategory = activeCategory === 'all' || note.category === activeCategory;
    
    const textStr = `${note.category} ${note.date} ${note.content}`.toLowerCase();
    const matchesSearch = textStr.includes(searchQuery);
    
    return matchesCategory && matchesSearch;
  });
  
  renderCards();
}

// Render cards list inside feed area
function renderCards() {
  cardsGrid.innerHTML = '';
  
  if (filteredNotes.length === 0) {
    cardsGrid.style.display = 'none';
    emptyState.style.display = 'flex';
    return;
  }
  
  emptyState.style.display = 'none';
  cardsGrid.style.display = 'flex';
  
  filteredNotes.forEach(note => {
    const card = document.createElement('article');
    card.className = 'card release-card';
    card.setAttribute('id', `note-${note.id.replace(/[^\w-]/g, '')}`);
    
    // Classify badge
    let badgeClass = 'badge-other';
    if (note.category === 'Feature') badgeClass = 'badge-feature';
    if (note.category === 'Announcement') badgeClass = 'badge-announcement';
    if (note.category === 'Deprecation') badgeClass = 'badge-deprecation';
    if (note.category === 'Bug Fix') badgeClass = 'badge-bugfix';
    
    card.innerHTML = `
      <div class="card-header">
        <div class="card-metadata">
          <span class="badge ${badgeClass}">${note.category}</span>
          <time class="card-date" datetime="${note.date}">${note.date}</time>
        </div>
        
        <div class="card-actions">
          <a href="${note.link}" target="_blank" rel="noopener" class="card-action-btn" title="View official release notes">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
        </div>
      </div>
      
      <div class="card-body">
        ${note.content}
      </div>
      
      <div class="card-footer">
        <div class="tweet-btn-wrapper">
          <button class="btn btn-secondary btn-sm btn-action-tweet" data-note-id="${note.id}">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            <span>Tweet Update</span>
          </button>
        </div>
      </div>
    `;
    
    // Bind Tweet button
    card.querySelector('.btn-action-tweet').addEventListener('click', () => {
      openTweetComposer(note);
    });
    
    cardsGrid.appendChild(card);
  });
}

// Open Tweet Composer Dialog with note details
function openTweetComposer(note) {
  // Render snippet box preview
  snippetBox.innerHTML = `
    <h3>${note.category} — ${note.date}</h3>
    <div style="font-size: 0.8rem; margin-top: 4px;">${note.content}</div>
  `;
  
  // Construct draft text
  const rawText = stripHtml(note.content).trim();
  const summaryLimit = 140;
  let summary = rawText;
  
  if (rawText.length > summaryLimit) {
    summary = rawText.slice(0, summaryLimit).trim() + "...";
  }
  
  const draftTweet = `📢 BigQuery Release [${note.category}] (${note.date}):\n\n"${summary}"\n\nCheck official details:\n${note.link}\n\n#GCP #BigQuery #Cloud`;
  
  tweetContent.value = draftTweet;
  updateCharCounter();
  
  // Open modal using native Dialog API
  tweetDialog.showModal();
}

// Update Character count circle progress and URL links
function updateCharCounter() {
  const maxChars = 280;
  const currentLength = tweetContent.value.length;
  const charsRemaining = maxChars - currentLength;
  
  charCount.textContent = charsRemaining;
  
  // Calculate SVG stroke offset
  // Circumference = 2 * PI * r = 2 * 3.14159 * 11 = 69.115
  const circumference = 69.1;
  const progressRatio = Math.min(currentLength / maxChars, 1);
  const strokeOffset = circumference - (progressRatio * circumference);
  
  charProgressCircle.style.strokeDashoffset = strokeOffset;
  
  // Color code depending on limit limits
  charProgressSvg.classList.remove('warning', 'danger');
  if (charsRemaining <= 40 && charsRemaining > 0) {
    charProgressSvg.classList.add('warning');
  } else if (charsRemaining <= 0) {
    charProgressSvg.classList.add('danger');
  }
  
  // Disable / Enable tweet links depending on text validation
  if (currentLength === 0 || charsRemaining < 0) {
    realTweetLink.classList.add('disabled');
    realTweetLink.style.pointerEvents = 'none';
    realTweetLink.style.opacity = '0.5';
  } else {
    realTweetLink.classList.remove('disabled');
    realTweetLink.style.pointerEvents = 'auto';
    realTweetLink.style.opacity = '1';
    
    // Update Web Intent URL
    const tweetEncoded = encodeURIComponent(tweetContent.value);
    realTweetLink.href = `https://twitter.com/intent/tweet?text=${tweetEncoded}`;
  }
}

// Loading Spinner Display Helper
function setLoadingState(isLoading) {
  if (isLoading) {
    refreshSpinner.classList.add('spinning');
    refreshBtn.disabled = true;
    skeletonFeed.style.display = 'flex';
    cardsGrid.style.display = 'none';
    emptyState.style.display = 'none';
  } else {
    refreshSpinner.classList.remove('spinning');
    refreshBtn.disabled = false;
    skeletonFeed.style.display = 'none';
  }
}

// Helper: Strip HTML markup from strings
function stripHtml(html) {
  const temp = document.createElement("div");
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || "";
}

// Helper: Dynamic Toast notifications
function showToast(message, duration = 4000) {
  const toastContainer = document.getElementById('toastContainer');
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <svg class="toast-success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
    <div class="toast-message">${message}</div>
  `;
  
  toastContainer.appendChild(toast);
  
  // Trigger removal
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, duration);
}
