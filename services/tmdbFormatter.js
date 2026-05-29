const { getImageUrl } = require('./tmdbClient');

function normalizeDate(value) {
    if (!value) {
        return '';
    }
    if (typeof value === 'string') {
        return value.slice(0, 10);
    }
    if (value instanceof Date) {
        const pad = num => String(num).padStart(2, '0');
        return [
            value.getFullYear(),
            pad(value.getMonth() + 1),
            pad(value.getDate())
        ].join('-');
    }
    return String(value).slice(0, 10);
}

function normalizeEpisode(item, tvId) {
    if (!item) {
        return null;
    }

    const seasonNumber = Number(item.season_number || item.seasonNumber || 0);
    const episodeNumber = Number(item.episode_number || item.episodeNumber || 0);

    return {
        id: item.id || item.episode_tmdb_id || 0,
        tvId: tvId || item.show_id || item.tv_id || item.tvId || 0,
        seasonNumber,
        episodeNumber,
        title: item.name || item.title || '',
        overview: item.overview || '',
        airDate: normalizeDate(item.air_date || item.airDate),
        stillPath: item.still_path || item.stillPath || '',
        stillUrl: getImageUrl(item.still_path || item.stillPath, 'w300'),
        voteAverage: item.vote_average || item.voteAverage || 0,
        runtime: item.runtime || 0,
        episodeType: item.episode_type || item.episodeType || '',
        label: seasonNumber && episodeNumber ? '第 ' + seasonNumber + ' 季第 ' + episodeNumber + ' 集' : ''
    };
}

function normalizeSeasonSummary(item) {
    return {
        id: item.id || 0,
        name: item.name || '',
        overview: item.overview || '',
        posterPath: item.poster_path || '',
        posterUrl: getImageUrl(item.poster_path, 'w342'),
        airDate: normalizeDate(item.air_date),
        episodeCount: item.episode_count || 0,
        seasonNumber: Number(item.season_number || 0)
    };
}

function normalizeSeason(payload, tvId) {
    const season = normalizeSeasonSummary(payload || {});
    season.tvId = tvId || 0;
    season.episodes = (payload && Array.isArray(payload.episodes) ? payload.episodes : [])
        .map(item => normalizeEpisode(item, tvId))
        .filter(Boolean);
    season.hasEpisodes = !!season.episodes.length;
    return season;
}

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
    detail.nextEpisode = normalizeEpisode(payload.next_episode_to_air, payload.id);
    detail.lastEpisode = normalizeEpisode(payload.last_episode_to_air, payload.id);
    detail.genres = payload.genres || [];
    detail.productionCountries = payload.production_countries || [];
    detail.originCountries = payload.origin_country || [];
    detail.originalLanguage = payload.original_language || '';
    detail.episodeRunTime = payload.episode_run_time || [];
    detail.inProduction = !!payload.in_production;
    detail.type = payload.type || '';
    detail.networks = payload.networks || [];
    detail.createdBy = payload.created_by || [];
    detail.seasons = Array.isArray(payload.seasons)
        ? payload.seasons.map(normalizeSeasonSummary).filter(item => item.seasonNumber > 0)
        : [];
    detail.defaultSeasonNumber = getDefaultSeasonNumber(detail);
    detail.hasSeasons = !!detail.seasons.length;

    return detail;
}

function getDefaultSeasonNumber(detail) {
    if (detail.lastEpisode && detail.lastEpisode.seasonNumber) {
        return detail.lastEpisode.seasonNumber;
    }
    if (detail.nextEpisode && detail.nextEpisode.seasonNumber) {
        return detail.nextEpisode.seasonNumber;
    }
    if (detail.seasons && detail.seasons.length) {
        return detail.seasons[detail.seasons.length - 1].seasonNumber;
    }
    return 1;
}

module.exports = {
    normalizeList,
    normalizeDetail,
    normalizeEpisode,
    normalizeSeason
};
