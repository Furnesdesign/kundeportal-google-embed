/**
 * v1.0.6
 * - Schema enhancement updates an existing JSON-LD script (static base in <head>)
 * - Fixes dayOfWeek to schema.org URIs (Monday...Sunday)
 * - Supports split opening hours (e.g. "09:00–12:00, 13:00–16:00")
 * - Only adds aggregateRating when data exists
 * - Adds fallback opening hours from Webflow fallback elements when Google does not return opening hours
 * - Supports special fallback opening hours by week using:
 *   - opening-hours-day-id="1..7"
 *   - opening-hours-special="MM/DD/YYYY"
 */

/**
 * Load Google data and optionally enhance schema + display reviews/opening hours.
 * @param {string} placeId
 * @param {object} options
 */
function loadGoogleData(placeId, options = {}) {
  const endpoint = `https://kundeportal-place-api.onrender.com/getPlaceDetails?placeId=${encodeURIComponent(placeId)}`;

  fetch(endpoint)
    .then(res => res.json())
    .then(data => {
      const mergedData = withFallbackOpeningHours(data, options.openingHoursSelectors || {});

      if (options.schemaEnhanceEnabled) {
        enhanceSchema(mergedData, options.schemaFields || {}, options.schemaTargetId);
      }

      if (options.reviewsEnabled) {
        displayReviews(mergedData, options.reviewSelectors || {});
      }

      if (options.openingHoursEnabled) {
        displayOpeningHours(mergedData, options.openingHoursSelectors || {});
      }
    })
    .catch(err => console.error('Error fetching place details:', err));
}

/**
 * Returns true if Google opening hours exist.
 */
function hasGoogleOpeningHours(data) {
  return !!(
    data &&
    data.opening_hours &&
    Array.isArray(data.opening_hours.weekday_text) &&
    data.opening_hours.weekday_text.length
  );
}

/**
 * Parse special date in MM/DD/YYYY format.
 */
function parseSpecialDate(value) {
  if (!value) return null;

  const parts = String(value).trim().split('/');
  if (parts.length !== 3) return null;

  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (!month || !day || !year) return null;

  const date = new Date(year, month - 1, day);
  if (isNaN(date.getTime())) return null;

  date.setHours(12, 0, 0, 0);
  return date;
}

/**
 * Get Monday 00:00:00 of current week.
 */
function getStartOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const jsDay = d.getDay(); // Sunday=0, Monday=1, ..., Saturday=6
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;

  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get Sunday 23:59:59.999 of current week.
 */
function getEndOfWeek(date) {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Returns true if a date falls in the current week (Monday-Sunday).
 */
function isDateInCurrentWeek(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return false;

  const now = new Date();
  const start = getStartOfWeek(now);
  const end = getEndOfWeek(now);

  return date >= start && date <= end;
}

/**
 * Build Google-like opening_hours.weekday_text from fallback DOM elements.
 * Supports ordinary items and special items for the current week.
 */
function getFallbackOpeningHours(selectors = {}) {
  const fallbackListSelector = selectors.fallbackList || '[opening-hours="fallback-list"]';
  const fallbackItemSelector = selectors.fallbackItem || '[opening-hours="fallback-item"]';
  const fallbackDaySelector = selectors.fallbackDay || '[opening-hours="fallback-day"]';
  const fallbackTimeSelector = selectors.fallbackTime || '[opening-hours="fallback-time"]';

  const fallbackList = document.querySelector(fallbackListSelector);
  if (!fallbackList) return null;

  const fallbackItems = Array.from(fallbackList.querySelectorAll(fallbackItemSelector));
  if (!fallbackItems.length) return null;

  const ordinaryByDayId = new Map();
  const specialByDayId = new Map();

  fallbackItems.forEach(item => {
    const dayId = String(item.getAttribute('opening-hours-day-id') || '').trim();
    const specialRaw = String(item.getAttribute('opening-hours-special') || '').trim();

    if (!dayId) return;

    const day = item.querySelector(fallbackDaySelector)?.textContent?.trim();
    const time = item.querySelector(fallbackTimeSelector)?.textContent?.trim();

    if (!day || !time) return;

    if (!specialRaw) {
      if (!ordinaryByDayId.has(dayId)) {
        ordinaryByDayId.set(dayId, `${day}: ${time}`);
      }
      return;
    }

    const specialDate = parseSpecialDate(specialRaw);
    if (!specialDate) return;

    if (isDateInCurrentWeek(specialDate)) {
      specialByDayId.set(dayId, `${day}: ${time}`);
    }
  });

  const weekdayText = [];

  for (let i = 1; i <= 7; i++) {
    const key = String(i);
    const line = specialByDayId.get(key) || ordinaryByDayId.get(key);
    if (line) weekdayText.push(line);
  }

  if (!weekdayText.length) return null;

  console.log('Fallback weekday_text used:', weekdayText);

  return {
    weekday_text: weekdayText
  };
}

/**
 * Use Google opening hours if available, otherwise fallback DOM hours.
 */
function withFallbackOpeningHours(data, selectors = {}) {
  if (hasGoogleOpeningHours(data)) return data;

  const fallbackOpeningHours = getFallbackOpeningHours(selectors);
  if (!fallbackOpeningHours) return data;

  console.log('Using fallback opening hours from Webflow elements');

  return {
    ...data,
    opening_hours: fallbackOpeningHours
  };
}

/**
 * Convert Norwegian day names to schema.org DayOfWeek URIs.
 */
const DAY_URI_MAP = {
  "Mandag": "https://schema.org/Monday",
  "Tirsdag": "https://schema.org/Tuesday",
  "Onsdag": "https://schema.org/Wednesday",
  "Torsdag": "https://schema.org/Thursday",
  "Fredag": "https://schema.org/Friday",
  "Lørdag": "https://schema.org/Saturday",
  "Søndag": "https://schema.org/Sunday"
};

/**
 * Parses a single weekday_text line from Google or fallback text into opening specs.
 * Examples:
 * "Mandag: 09:00–16:00"
 * "Tirsdag: Stengt"
 * "Onsdag: 09:00–12:00, 13:00–16:00"
 * Returns array of OpeningHoursSpecification objects (possibly empty).
 */
function parseWeekdayTextToSpecs(weekdayText) {
  const parts = String(weekdayText).split(': ');
  const dayNo = (parts[0] || '').trim();

  if (!dayNo || !parts[1]) return [];

  const timePartRaw = parts[1].trim();
  if (!timePartRaw || timePartRaw.toLowerCase() === 'stengt') return [];

  const dayOfWeekUri = DAY_URI_MAP[dayNo] || dayNo;

  const normalized = timePartRaw.replace(/–|—/g, '-');
  const intervals = normalized.split(',').map(s => s.trim()).filter(Boolean);

  const specs = [];

  intervals.forEach(interval => {
    const [opens, closes] = interval.split('-').map(s => (s || '').trim());
    if (!opens || !closes) return;

    specs.push({
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": dayOfWeekUri,
      "opens": opens,
      "closes": closes
    });
  });

  return specs;
}

/**
 * Enhances an existing JSON-LD LocalBusiness/MedicalClinic schema in the <head>.
 * It does NOT create schema from scratch. You must have a base JSON-LD script present.
 *
 * @param {object} placeData - From your place details endpoint (Google Places)
 * @param {object} fields - Optional config fields (e.g. gbp, medicalSpecialty)
 * @param {string} targetId - The <script id="..."> containing base JSON-LD
 */
function enhanceSchema(placeData, fields, targetId) {
  if (!targetId) {
    console.warn('schemaTargetId missing. Skipping schema enhancement.');
    return;
  }

  const el = document.getElementById(targetId);
  if (!el) {
    console.warn(`Schema element #${targetId} not found. Skipping schema enhancement.`);
    return;
  }

  let base;
  try {
    base = JSON.parse(el.textContent);
  } catch (e) {
    console.warn('Failed to parse base JSON-LD. Skipping schema enhancement.', e);
    return;
  }

  base["@context"] = base["@context"] || "https://schema.org";

  if (fields.type) {
    base["@type"] = Array.isArray(fields.type) ? fields.type : [fields.type];
  } else if (!base["@type"]) {
    base["@type"] = ["LocalBusiness"];
  }

  if (fields.medicalSpecialty && String(fields.medicalSpecialty).trim() !== "") {
    const typeStr = Array.isArray(base["@type"]) ? String(base["@type"][0] || "") : String(base["@type"] || "");
    const isMedicalType = /medical|clinic|hospital|dentist|physio|podiat/i.test(typeStr.toLowerCase());
    if (isMedicalType) {
      base.medicalSpecialty = String(fields.medicalSpecialty).trim();
    }
  }

  if (fields.gbp && typeof fields.gbp === "string") {
    const gbp = fields.gbp.trim();
    if (gbp) {
      const sameAs = Array.isArray(base.sameAs) ? base.sameAs : [];
      if (!sameAs.includes(gbp)) sameAs.push(gbp);
      if (sameAs.length) base.sameAs = sameAs;
    }
  }

  if (typeof placeData.rating === "number" && typeof placeData.user_ratings_total === "number") {
    base.aggregateRating = {
      "@type": "AggregateRating",
      "ratingValue": placeData.rating,
      "reviewCount": placeData.user_ratings_total
    };
  }

  const openingSpecs = [];
  if (placeData.opening_hours && Array.isArray(placeData.opening_hours.weekday_text)) {
    placeData.opening_hours.weekday_text.forEach(line => {
      openingSpecs.push(...parseWeekdayTextToSpecs(line));
    });
  }

  if (openingSpecs.length) {
    base.openingHoursSpecification = openingSpecs;
  }

  el.textContent = JSON.stringify(base, null, 2);
}

/**
 * Display reviews visually.
 */
function displayReviews(data, selectors) {
  const averageScore = data.rating || 0;
  const starsBars = document.querySelectorAll(selectors.starsBar || '[hero-reviews="stars-bar"]');
  const starsPercentage = (averageScore / 5) * 100;

  starsBars.forEach(starsBar => {
    starsBar.style.width = `${starsPercentage}%`;
  });

  const scoreTexts = document.querySelectorAll(selectors.score || '[hero-reviews="score"]');
  scoreTexts.forEach(scoreText => {
    scoreText.textContent = Number.isInteger(averageScore) ? `${averageScore}` : `${averageScore.toFixed(1)}`;
  });

  const textWrappers = document.querySelectorAll(selectors.textWrapper || '[hero-reviews="text-wrapper"]');

  const reviewsLink =
    selectors.reviewsLink ||
    (data.place_id
      ? `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(data.place_id)}`
      : null);

  if (reviewsLink) {
    textWrappers.forEach(tw => {
      tw.setAttribute('href', reviewsLink);
      tw.setAttribute('target', '_blank');
      tw.setAttribute('rel', 'noopener');
    });
  }

  if (Array.isArray(data.reviews)) {
    const reviewersWithPhotos = data.reviews.filter(r => r && r.profile_photo_url);
    const photos = reviewersWithPhotos.slice(0, 3);

    photos.forEach((review, index) => {
      const q = selectors.profilePhoto ? selectors.profilePhoto(index + 1) : `[hero-reviews="profile-photo-${index + 1}"]`;
      const profilePhotoElements = document.querySelectorAll(q);
      profilePhotoElements.forEach(el => {
        el.innerHTML = `<img src="${review.profile_photo_url}" alt="Profile photo of ${review.author_name || 'reviewer'}" />`;
      });
    });
  }
}

/**
 * Display opening hours visually.
 */
function displayOpeningHours(data, selectors) {
  const container = document.querySelector(selectors.list || '[opening-hours="list"]');
  const template = document.querySelector(selectors.item || '[opening-hours="item"]')?.cloneNode(true);

  if (!container || !template) {
    console.warn('Opening hours selectors not found.');
    return;
  }

  template.style.display = null;
  container.innerHTML = '';

  if (data.opening_hours && Array.isArray(data.opening_hours.weekday_text)) {
    data.opening_hours.weekday_text.forEach((oh, index) => {
      const clone = template.cloneNode(true);
      const parts = String(oh).split(': ');
      const day = (parts[0] || '').trim();
      const times = (parts[1] || 'Stengt').replace(/–|—/g, ' - ');

      const dayEl = clone.querySelector(selectors.day || '[opening-hours="day"]');
      const timeEl = clone.querySelector(selectors.time || '[opening-hours="time"]');

      if (dayEl) dayEl.textContent = day;
      if (timeEl) timeEl.textContent = times;

      if (index === data.opening_hours.weekday_text.length - 1) {
        clone.style.borderBottomColor = 'transparent';
      }

      container.appendChild(clone);
    });
  }
}
