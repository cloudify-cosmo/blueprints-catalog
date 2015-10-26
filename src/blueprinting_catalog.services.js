'use strict';

(function () {
    var LOGGER = 'BCW SERVICES';

    var DEFAULT_ERROR = 'unexpected error occurred';

    var BLUEPRINT_FILE_REGEX = /blueprint.yaml$/i;

    angular.module('blueprintingCatalogWidget')

        .factory('WidgetConfig', ['widgetDefaults', function (widgetDefaults) {

            var repoGroups,
                defaultVersion, defaultVersionFallback,
                catalogDefaultManager, catalogCorsProxy,
                initialized = false;

            return {

                initConfig: function ($scope) {
                    repoGroups = angular.copy(widgetDefaults.repoGroups);

                    if ($scope.blueprintsGithubQuery) {
                        repoGroups.blueprints.githubQuery = $scope.blueprintsGithubQuery;
                    }
                    if ($scope.pluginsGithubQuery) {
                        repoGroups.plugins.githubQuery = $scope.pluginsGithubQuery;
                    }
                    if ($scope.integrationsGithubQuery) {
                        repoGroups.integrations.githubQuery = $scope.integrationsGithubQuery;
                    }

                    if ($scope.defaultVersion) {
                        defaultVersion = $scope.defaultVersion;
                    }
                    if ($scope.defaultVersionFallback) {
                        defaultVersionFallback = $scope.defaultVersionFallback;
                    }

                    if ($scope.catalogDefaultManager) {
                        catalogDefaultManager = $scope.catalogDefaultManager;
                    }
                    if ($scope.catalogCorsProxy) {
                        catalogCorsProxy = $scope.catalogCorsProxy;
                    }

                    initialized = true;
                },

                checkConfig: function () {
                    if (!initialized) {
                        throw new Error('configuration was not initialized');
                    }
                },

                getRepoGroups: function () {
                    this.checkConfig();

                    return repoGroups;
                },

                getDefaultVersion: function () {
                    this.checkConfig();

                    return defaultVersion;
                },

                getDefaultVersionFallback: function () {
                    this.checkConfig();

                    return defaultVersionFallback;
                },

                getDefaultManager: function () {
                    this.checkConfig();

                    return catalogDefaultManager;
                },

                getCorsProxy: function () {
                    this.checkConfig();

                    return catalogCorsProxy;
                }
            };

        }])

        .factory('CatalogHelper', ['Github', 'WidgetConfig', '$q', '$sce', '$log', function (Github, WidgetConfig, $q, $sce, $log) {

            return {
                changeVersion: function (repo, version, $scope) {
                    $log.debug(LOGGER, 'change version to', version);

                    repo.currentVersion = version;

                    return $q.all([
                        this.fillReadme(repo, version, $scope),
                        this.fillBlueprints(repo, version, $scope)
                    ]);
                },

                fillVersions: function (repo, $scope) {
                    if (!repo.versionsList) {
                        $log.debug(LOGGER, 'filling branches & tags for repo', repo);

                        var versionsList = [];
                        var tagsPromise = Github.getTags(repo.url);
                        var branchesPromise = Github.getBranches(repo.url);

                        return $q.all([branchesPromise, tagsPromise]).then(function (response) {
                            versionsList = versionsList.concat(response[0].data || []).concat(response[1].data || []);
                            var repoDefaultVersionName = WidgetConfig.getDefaultVersion() || WidgetConfig.getDefaultVersionFallback();
                            var repoDefaultBranchName = repo.default_branch;
                            var repoDefaultVersion, repoDefaultBranch;
                            for (var i = 0, len = versionsList.length, v; i < len; i++) {
                                v = versionsList[i];
                                if (v.name === repoDefaultVersionName) {
                                    repoDefaultVersion = v;
                                }
                                if (v.name === repoDefaultBranchName) {
                                    repoDefaultBranch = v;
                                }
                            }
                            repo.currentVersion = repoDefaultVersion || repoDefaultBranch;

                            repo.versionsList = versionsList;
                        }, this.handleGithubLimit($scope));
                    }
                },

                fillBlueprints: function (repo, version, $scope) {
                    repo.blueprintFiles = repo.blueprintFiles || {};
                    if (!repo.blueprintFiles[version.name]) {
                        $log.debug(LOGGER, 'filling blueprints for repo', repo);

                        return Github.getTree(repo.url, version.commit.sha).then(function (response) {
                            var blueprints = [];
                            var files = response.data && response.data.tree || [];
                            for (var i = 0, len = files.length, f; i < len; i++) {
                                f = files[i];
                                if (f.type === 'blob' && BLUEPRINT_FILE_REGEX.test(f.path)) {
                                    blueprints.push(f.path);
                                }
                            }
                            repo.blueprintFiles[version.name] = blueprints;
                        }, this.handleGithubLimit($scope));
                    }
                },

                fillReadme: function (repo, version, $scope) {
                    repo.readmeContents = repo.readmeContents || {};
                    if (!repo.readmeContents[version.name]) {
                        $log.debug(LOGGER, 'filling readme for repo', repo);

                        return Github.getReadme(repo.url, version.name).then(function (response) {
                            repo.readmeContents[version.name] = $sce.trustAsHtml(response.data || 'No Readme File');
                        }, this.handleGithubLimit($scope));
                    }
                },

                handleGithubLimit: function ($scope) {
                    return function (response) {
                        if (response.status === 403 && response.headers('X-RateLimit-Remaining') === '0') {
                            $scope.githubLimit = true;
                        }
                    };
                },

                getErrorFromResponse: function (response) {
                    if (response && response.data) {
                        if (typeof response.data === 'string') {
                            return response.data;
                        } else {
                            return response.data.message || DEFAULT_ERROR;
                        }
                    } else {
                        return DEFAULT_ERROR;
                    }
                }
            };
        }])

        .factory('Github', ['$http', function ($http) {
            var endpoint = 'https://api.github.com';

            return {
                getRepositories: function (query) {
                    return $http({
                        method: 'GET',
                        url: endpoint + '/search/repositories?q=' + query
                    });
                },
                getTags: function (repo_url) {
                    return $http({
                        method: 'GET',
                        url: repo_url + '/tags'
                    });
                },
                getBranches: function (repo_url) {
                    return $http({
                        method: 'GET',
                        url: repo_url + '/branches'
                    });
                },
                getReadme: function (repo_url, version) {
                    return $http({
                        method: 'GET',
                        url: repo_url + '/readme' + (version ? '?ref=' + encodeURIComponent(version) : ''),
                        headers: {
                            'Accept': 'application/vnd.github.html+json'
                        }
                    });
                },
                getTree: function (repo_url, sha) {
                    return $http({
                        method: 'GET',
                        url: repo_url + '/git/trees/' + sha
                    });
                }
            };
        }])

        .factory('CloudifyManager', ['$http', function ($http) {

            return {
                upload: function doUpload(endpoint, blueprint, catalogCorsProxy) {
                    var queryParams = [], query, url;
                    if (blueprint.path) {
                        queryParams.push('application_file_name=' + encodeURIComponent(blueprint.path));
                    }
                    if (blueprint.url) {
                        queryParams.push('blueprint_archive_url=' + encodeURIComponent(blueprint.url));
                    }
                    query = queryParams.length ? ('?' + queryParams.join('&')) : '';
                    url = endpoint + '/blueprints/' + encodeURIComponent(blueprint.id) + query;

                    if (catalogCorsProxy) {
                        return $http({
                            method: 'POST',
                            url: catalogCorsProxy,
                            data: {
                                method: 'PUT',
                                url: url
                            }
                        });
                    } else {
                        return $http({
                            method: 'PUT',
                            url: url
                        });
                    }
                }
            };
        }]);
})();
