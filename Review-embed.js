fetch('https://us-central1-kundeportal-online.cloudfunctions.net/Business-profil_test-3/getPlaceDetails?placeId=ChIJ_cenv4TZFkYRGElooLAOVOE')
  .then(response => response.json())
  .then(data => {
    console.log('Place Details:', data);
    console.log('Full Data Response:', JSON.stringify(data, null, 2));
    for (const key in data) {
      console.log(Key: ${key}, Value:, data[key]);
    }
    console.log('User Ratings Total:', data.user_ratings_total);

    // Update the stars bar based on the average rating
    const averageScore = data.rating;
    const starsBars = document.querySelectorAll('[hero-reviews="stars-bar"]');
    const starsPercentage = (averageScore / 5) * 100;
    starsBars.forEach(starsBar => {
      starsBar.style.width = ${starsPercentage}%;
    });

    // Update the text information about score and number of reviews
    const scoreTexts = document.querySelectorAll('[hero-reviews="score"]');
        const textWrappers = document.querySelectorAll('[hero-reviews="text-wrapper"]');
    const placeId = 'ChIJ_cenv4TZFkYRGElooLAOVOE';
    const reviewsLink = https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${placeId};
    
    scoreTexts.forEach(scoreText => {
      scoreText.textContent = Number.isInteger(averageScore) ? ${averageScore} : ${averageScore.toFixed(1)};
    });
    
    textWrappers.forEach(textWrapper => {
      textWrapper.setAttribute('href', reviewsLink);
      textWrapper.setAttribute('target', '_blank');
    });

    // Update profile photos for three reviewers with photos
    if (data.reviews) {
      const reviewersWithPhotos = data.reviews.filter(review => review.profile_photo_url);
      const photos = reviewersWithPhotos.slice(0, 3);

      photos.forEach((review, index) => {
        const profilePhotoElements = document.querySelectorAll([hero-reviews="profile-photo-${index + 1}"]);
        profilePhotoElements.forEach(profilePhotoElement => {
          if (profilePhotoElement) {
            profilePhotoElement.innerHTML = <img src="${review.profile_photo_url}" alt="Profile photo of ${review.author_name}" />;
          }
        });
      });
    }
  })
  .catch(error => console.error('Error fetching details:', error));
