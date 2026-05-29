const { getImageUrl } = require('./tmdbClient');

function normalizeMedia(item, mediaType) {
    return {
        id: item.id,
        mediaType,
        title: mediaType === 'movie' ? item.title : item.name,
        originalTitle: mediaType === 'movie' ? item.original_title : item.original_name,
        overview: item.overview || '',
        posterPath: item.poster_path || '',
        posterUrl: getImageUrl(item.poster_path, 'w342'),
        backdropUrl: getImageUrl(item.backdrop_path, 'w780'),
        releaseDate: item.release_date || '',
        firstAirDate: item.first_air_date || '',
        voteAverage: item.vote_average || 0,
        popularity: item.popularity || 0,
        genreIds: item.genre_ids || [],
        originCountry: item.origin_country || [],
        originalLanguage: item.original_language || ''
    };
}

function normalizeList(payload, mediaType) {
    const results = Array.isArray(payload.results) ? payload.results : [];

    return {
        page: payload.page || 1,
        totalPages: payload.total_pages || 0,
        totalResults: payload.total_results || 0,
        list: results.map(item => normalizeMedia(item, mediaType))
    };
}

function normalizeDetail(payload, mediaType) {
    const detail = normalizeMedia(payload, mediaType);

    detail.homepage = payload.homepage || '';
    detail.status = payload.status || '';
    detail.tagline = payload.tagline || '';
    detail.runtime = payload.runtime || 0;
    detail.numberOfSeasons = payload.number_of_seasons || 0;
    detail.numberOfEpisodes = payload.number_of_episodes || 0;
    detail.lastAirDate = payload.last_air_date || '';
    detail.nextEpisodeToAir = payload.next_episode_to_air || null;
    detail.lastEpisodeToAir = payload.last_episode_to_air || null;
    detail.genres = payload.genres || [];
    detail.productionCountries = payload.production_countries || [];

    return detail;
}

module.exports = {
    normalizeList,
    normalizeDetail
};
