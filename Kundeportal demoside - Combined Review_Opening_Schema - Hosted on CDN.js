/**
 * Load Google data dynamically and handle schema markup, reviews, and opening hours.
 * @param {string} placeId - The Google Place ID for the location.
 * @param {object} options - Configuration options for schema, reviews, and opening hours.
 */
function loadGoogleData(placeId, options = {}) {
    // Fetch data from the Google API
    fetch(`https://us-central1-kundeportal-online.cloudfunctions.net/Google-Business-profil-v1/getPlaceDetails?placeId=${placeId}`)
        .then(response => response.json())
        .then(data => {
            console.log('Place Details:', data);

            // Handle schema markup if enabled
            if (options.schemaEnabled) {
                generateSchema(data, options.schemaFields || {});
            }

            // Handle reviews if enabled
            if (options.reviewsEnabled) {
                displayReviews(data, options.reviewSelectors || {});
            }

            // Handle opening hours if enabled
            if (options.openingHoursEnabled) {
                displayOpeningHours(data, options.openingHoursSelectors || {});
            }
        })
        .catch(error => console.error('Error fetching details:', error));
}

/**
 * Generate and inject schema markup.
 * @param {object} data - The API response data.
 * @param {object} fields - Custom fields for schema markup.
 */
function generateSchema(data, fields) {
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

    // Dynamically construct the schema and exclude empty fields
    const schemaMarkup = {
        "@context": "https://schema.org",
        "@type": fields.type || "Dentist",
        ...(fields.name && { "name": fields.name }),
        ...(fields.url && { "url": fields.url }),
        ...(fields.address && { "address": fields.address }),
        ...(fields.telephone && { "telephone": fields.telephone }),
        ...(fields.priceRange && { "priceRange": fields.priceRange }),
        "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": data.rating || 0,
            "reviewCount": data.user_ratings_total || 0
        },
        ...(openingHoursSpecification.length && { "openingHoursSpecification": openingHoursSpecification })
    };

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schemaMarkup, null, 2);
    document.head.appendChild(script);
    console.log('Schema Markup Added:', schemaMarkup);
}

/**
 * Display reviews dynamically.
 * @param {object} data - The API response data.
 * @param {object} selectors - Custom selectors for DOM elements.
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
 * Display opening hours dynamically.
 * @param {object} data - The API response data.
 * @param {object} selectors - Custom selectors for DOM elements.
 */
function displayOpeningHours(data, selectors) {
    const container = document.querySelector(selectors.list || '[opening-hours="list"]');
    const template = document.querySelector(selectors.item || '[opening-hours="item"]').cloneNode(true);

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