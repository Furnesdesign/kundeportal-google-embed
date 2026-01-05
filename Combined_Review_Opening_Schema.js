/**
 * v1.0.4
 * - Schema enhancement updates an existing JSON-LD script (static base in <head>)
 * - Fixes dayOfWeek to schema.org URIs (Monday...Sunday)
 * - Supports split opening hours (e.g. "09:00–12:00, 13:00–16:00")
 * - Only adds aggregateRating when data exists
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
      // Enhance schema (updates existing JSON-LD in <head>)
      if (options.schemaEnhanceEnabled) {
        enhanceSchema(data, options.schemaFields || {}, options.schemaTargetId);
      }

      // UI: Reviews
      if (options.reviewsEnabled) {
        displayReviews(data, options.reviewSelectors || {});
      }

      // UI: Opening hours
      if (options.openingHoursEnabled) {
        displayOpeningHours(data, options.openingHoursSelectors || {});
      }
    })
    .catch(err => console.error('Error fetching place details:', err));
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
 * Parses a single weekday_text line from Google (Norwegian) into opening specs.
 * Examples:
 * "Mandag: 09:00–16:00"
 * "Tirsdag: Stengt"
 * "Onsdag: 09:00–12:00, 13:00–16:00"
 * Returns array of OpeningHoursSpecification objects (possibly empty).
 */
function parseWeekdayTextToSpecs(weekdayText) {
  const parts = String(weekdayText).split(': ');
  const dayNo = (parts[0] || '').trim();

  // If the format is unexpected, bail out safely.
  if (!dayNo || !parts[1]) return [];

  const timePartRaw = parts[1].trim();
  if (!timePartRaw || timePartRaw.toLowerCase() === 'stengt') return [];

  const dayOfWeekUri = DAY_URI_MAP[dayNo] || dayNo; // fallback if not matched

  // Normalize dash characters and split on commas for multiple intervals.
  // Google sometimes uses en-dash or em-dash.
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

  // Ensure @context exists
  base["@context"] = base["@context"] || "https://schema.org";

  // Ensure @type is array-friendly
  if (fields.type) {
    base["@type"] = Array.isArray(fields.type) ? fields.type : [fields.type];
  } else if (!base["@type"]) {
    base["@type"] = ["LocalBusiness"];
  }

  // Optional: medicalSpecialty only if provided and type is medical-like
  if (fields.medicalSpecialty && String(fields.medicalSpecialty).trim() !== "") {
    const typeStr = Array.isArray(base["@type"]) ? String(base["@type"][0] || "") : String(base["@type"] || "");
    const isMedicalType = /medical|clinic|hospital צור|dentist|physio|podiat/i.test(typeStr.toLowerCase());
    if (isMedicalType) {
      base.medicalSpecialty = String(fields.medicalSpecialty).trim();
    }
  }

  // sameAs: merge in gbp if provided and not present
  if (fields.gbp && typeof fields.gbp === "string") {
    const gbp = fields.gbp.trim();
    if (gbp) {
      const sameAs = Array.isArray(base.sameAs) ? base.sameAs : [];
      if (!sameAs.includes(gbp)) sameAs.push(gbp);
      if (sameAs.length) base.sameAs = sameAs;
    }
  }

  // Aggregate rating only if real data exists
  if (typeof placeData.rating === "number" && typeof placeData.user_ratings_total === "number") {
    base.aggregateRating = {
      "@type": "AggregateRating",
      "ratingValue": placeData.rating,
      "reviewCount": placeData.user_ratings_total
    };
  }

  // Opening hours specification from Google Places weekday_text
  const openingSpecs = [];
  if (placeData.opening_hours && Array.isArray(placeData.opening_hours.weekday_text)) {
    placeData.opening_hours.weekday_text.forEach(line => {
      openingSpecs.push(...parseWeekdayTextToSpecs(line));
    });
  }
  if (openingSpecs.length) {
    base.openingHoursSpecification = openingSpecs;
  }

  // Write back to the same script tag
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

  // Safer reviews link: use place_id if available in endpoint response (if you include it)
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

