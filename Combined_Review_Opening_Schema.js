/**
 * Load Google data dynamically and handle schema markup, reviews, and opening hours.
 * @param {string} placeId - The Google Place ID for the location.
 * @param {object} options - Configuration options for schema, reviews, and opening hours.
 */
function loadGoogleData(placeId, options = {}) {
    fetch(`https://kundeportal-place-api.onrender.com/getPlaceDetails?placeId=${placeId}`)
        .then(response => response.json())
        .then(data => {
            console.log('Place Details:', data);

            if (options.schemaEnabled) {
                generateSchema(data, options.schemaFields || {});
            }

            if (options.reviewsEnabled) {
                displayReviews(data, options.reviewSelectors || {});
            }

            if (options.openingHoursEnabled) {
                displayOpeningHours(data, options.openingHoursSelectors || {});
            }
        })
        .catch(error => console.error('Error fetching details:', error));
}

/**
 * Generate and inject schema markup dynamically.
 * Handles:
 * - Multiple @type values
 * - Optional medicalSpecialty (only for medical-type businesses, and only when non-empty)
 * - Logo
 * - sameAs from GBP / Facebook / Instagram / LinkedIn
 * - @id auto-generated from url if not provided
 */
function generateSchema(data, fields) {
    // ----- Opening hours from Google Places -----
    const openingHoursSpecification = [];

    if (data.opening_hours && data.opening_hours.weekday_text) {
        data.opening_hours.weekday_text.forEach(oh => {
            const parts = oh.split(': ');
            const dayOfWeek = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);

            if (parts[1] && parts[1].toLowerCase() !== "stengt") {
                const times = parts[1].replace(/–|—/g, ' - ');
                const [openTime, closeTime] = times.split(' - ');

                openingHoursSpecification.push({
                    "@type": "OpeningHoursSpecification",
                    "dayOfWeek": dayOfWeek,
                    "opens": openTime.trim(),
                    "closes": closeTime.trim()
                });
            }
        });
    }

    // ----- Support one or more @type (e.g. ["LocalBusiness", "MedicalClinic"]) -----
    const typeValue = Array.isArray(fields.type) ? fields.type : [fields.type || "Dentist"];
    const primaryType = typeValue[0] ? String(typeValue[0]) : "";

    const schemaMarkup = {
        "@context": "https://schema.org",
        "@type": typeValue
    };

    // ----- Basic identity -----
    if (fields.name) schemaMarkup.name = fields.name;
    if (fields.description) schemaMarkup.description = fields.description;
    if (fields.url) schemaMarkup.url = fields.url;

    // ----- @id (stable identifier) -----
    if (fields.id) {
        schemaMarkup["@id"] = fields.id;
    } else if (fields.url) {
        // Remove trailing slash and append #business
        schemaMarkup["@id"] = fields.url.replace(/\/$/, "") + "#business";
    }

    // ----- Logo -----
    if (fields.logo) {
        schemaMarkup.logo = fields.logo;
    }

    // ----- Address, telephone, priceRange -----
    if (fields.address) schemaMarkup.address = fields.address;
    if (fields.telephone) schemaMarkup.telephone = fields.telephone;
    if (fields.priceRange) schemaMarkup.priceRange = fields.priceRange;

    // ----- medicalSpecialty (optional, only for medical-like types and non-empty value) -----
    if (
        fields.medicalSpecialty &&
        typeof fields.medicalSpecialty === "string" &&
        fields.medicalSpecialty.trim() !== ""
    ) {
        const typeLower = primaryType.toLowerCase();
        const isMedicalType = /medical|clinic|hospital|dentist|physio|podiat/i.test(typeLower);

        if (isMedicalType) {
            schemaMarkup.medicalSpecialty = fields.medicalSpecialty.trim();
        }
    }

    // ----- sameAs from social / GBP URLs (filter out empties) -----
    const sameAsFromConfig = [];

    // Allow a direct sameAs array if you ever want that
    if (Array.isArray(fields.sameAs)) {
        sameAsFromConfig.push(...fields.sameAs);
    } else {
        // Individual fields from your CMS
        sameAsFromConfig.push(
            fields.gbp,
            fields.facebook,
            fields.instagram,
            fields.linkedin
        );
    }

    const sameAsClean = sameAsFromConfig
        .filter(url => typeof url === "string")
        .map(url => url.trim())
        .filter(url => url.length > 0);

    if (sameAsClean.length) {
        schemaMarkup.sameAs = sameAsClean;
    }

    // ----- Aggregate rating from Google Places -----
    schemaMarkup.aggregateRating = {
        "@type": "AggregateRating",
        "ratingValue": data.rating || 0,
        "reviewCount": data.user_ratings_total || 0
    };

    // ----- Opening hours specification -----
    if (openingHoursSpecification.length) {
        schemaMarkup.openingHoursSpecification = openingHoursSpecification;
    }

    // ----- Inject JSON-LD into <head> -----
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schemaMarkup, null, 2);
    document.head.appendChild(script);

    console.log('Schema Markup Added:', schemaMarkup);
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
    const textWrappers = document.querySelectorAll(selectors.textWrapper || '[hero-reviews="text-wrapper"]');
    const reviewsLink = selectors.reviewsLink || `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${selectors.placeId}`;

    scoreTexts.forEach(scoreText => {
        scoreText.textContent = Number.isInteger(averageScore) ? `${averageScore}` : `${averageScore.toFixed(1)}`;
    });

    textWrappers.forEach(textWrapper => {
        textWrapper.setAttribute('href', reviewsLink);
        textWrapper.setAttribute('target', '_blank');
    });

    if (data.reviews) {
        const reviewersWithPhotos = data.reviews.filter(review => review.profile_photo_url);
        const photos = reviewersWithPhotos.slice(0, 3);

        photos.forEach((review, index) => {
            const profilePhotoElements = document.querySelectorAll(selectors.profilePhoto(index + 1));
            profilePhotoElements.forEach(profilePhotoElement => {
                if (profilePhotoElement) {
                    profilePhotoElement.innerHTML = `<img src="${review.profile_photo_url}" alt="Profile photo of ${review.author_name}" />`;
                }
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

    if (data.opening_hours) {
        data.opening_hours.weekday_text.forEach((oh, index) => {
            const clone = template.cloneNode(true);
            const parts = oh.split(': ');
            const dayOfWeek = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
            const times = parts[1]?.replace(/–|—/g, ' - ') || 'Stengt';

            clone.querySelector(selectors.day || '[opening-hours="day"]').textContent = dayOfWeek;
            clone.querySelector(selectors.time || '[opening-hours="time"]').textContent = times;

            if (index === data.opening_hours.weekday_text.length - 1) {
                clone.style.borderBottomColor = 'transparent';
            }

            container.appendChild(clone);
        });
    }
}
