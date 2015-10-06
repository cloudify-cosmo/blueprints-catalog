'use strict';

(function () {
    var catalog = angular.module('blueprintingCatalogWidget', []);

    var LOG_TAG = 'BLUEPRINTING CATALOG WIDGET';
    var defaultError = 'unexpected error occurred';

    var endpoint = 'https://api.github.com';
    var githubQuery = '/search/repositories?q=*-example+user:cloudify-examples';
    var defaultVersion = 'master';

    catalog.directive('blueprintingCatalog', ['Github', 'CloudifyManager', 'CatalogHelper', '$q', '$log',
        function (Github, CloudifyManager, CatalogHelper, $q, $log) {

            return {
                restrict: 'A',
                scope: {
                    githubQuery: '@catalogGithubQuery',
                    listTitle: '@catalogListTitle',
                    listDescription: '@catalogListDescription',
                    blueprintsEndpoint: '@catalogDefaultManager',
                    defaultVersion: '@catalogDefaultVersion'
                },
                templateUrl: 'blueprinting_catalog_widget_tpl.html',
                link: function ($scope) {
                    if ($scope.githubQuery) {
                        githubQuery = $scope.githubQuery;

                        $log.debug(LOG_TAG, 'default search query was overridden with', githubQuery);
                    }
                    if ($scope.defaultVersion) {
                        defaultVersion = $scope.defaultVersion;
                    }

                    $scope.blueprintsEndpoint = $scope.blueprintsEndpoint || '';

                    $scope.loading = true;
                    Github.getRepositories().then(function (response) {
                        $log.debug(LOG_TAG, 'fetched repos', response);

                        $scope.repos = response.data && response.data.items || [];
                    }).finally(function () {
                        $scope.loading = false;
                    });

                    $scope.showDetails = function (repo) {
                        $log.debug(LOG_TAG, 'show details', repo);

                        $q.when(CatalogHelper.fillVersions(repo), function () {
                            CatalogHelper.fillReadme(repo);
                        });

                        $scope.currentRepo = repo;
                    };

                    $scope.changeVersion = function (version) {
                        $scope.currentRepo.currentVersion = version;

                        CatalogHelper.fillReadme($scope.currentRepo);
                    };

                    $scope.showList = function () {
                        $scope.currentRepo = undefined;
                    };

                    $scope.showUpload = function (repo) {
                        $log.debug(LOG_TAG, 'show upload', repo);

                        CatalogHelper.fillVersions(repo);

                        $scope.managerEndpoint = $scope.blueprintsEndpoint;
                        $scope.blueprint = {
                            path: 'blueprint.yaml',
                            id: repo.name,
                            url: repo.html_url + '/archive/' + repo.currentVersion + '.zip'
                        };

                        $scope.uploadRepo = repo;
                    };

                    $scope.closeUpload = function () {
                        $scope.error = undefined;
                        $scope.uploadRepo = undefined;
                    };

                    $scope.uploadBlueprint = function () {
                        $log.debug(LOG_TAG, 'do upload');

                        if ($scope.blueprintForm.$valid) {

                            $scope.processing = true;
                            $scope.error = undefined;
                            CloudifyManager.upload($scope.managerEndpoint, $scope.blueprint)
                                .then(function () {
                                    $scope.uploadRepo = undefined;
                                }, function (response) {
                                    $scope.error = CatalogHelper.getErrorFromResponse(response);
                                })
                                .finally(function () {
                                    $scope.processing = false;
                                });
                        }
                    };
                }
            };

        }]);

    catalog.factory('CatalogHelper', ['Github', '$q', '$sce', function (Github, $q, $sce) {

        return {
            fillVersions: function (repo) {
                if (!repo.versionsList) {
                    var versionsList = repo.versionsList = [];
                    var tagsPromise = Github.getTags(repo.url);
                    var branchesPromise = Github.getBranches(repo.url);

                    return $q.all([branchesPromise, tagsPromise]).then(function (response) {
                        versionsList = versionsList.concat(response[0].data || []).concat(response[1].data || []);
                        for (var i = 0, len = versionsList.length, v; i < len; i++) {
                            v = versionsList[i];
                            if (v.name === defaultVersion) {
                                repo.defaultVersion = defaultVersion;
                                break;
                            }
                        }
                        if (!repo.defaultVersion) {
                            repo.defaultVersion = repo.default_branch;
                        }
                        repo.currentVersion = repo.defaultVersion;

                        repo.versionsList = versionsList;
                    });
                }
            },
            fillReadme: function (repo) {
                repo.readmeContents = repo.readmeContents || {};
                if (!repo.readmeContents[repo.currentVersion]) {
                    Github.getReadme(repo.url, repo.currentVersion).then(function (response) {
                        repo.readmeContents[repo.currentVersion] = $sce.trustAsHtml(response.data || 'No Readme File');
                    }, function () {
                        repo.readmeContents[repo.currentVersion] = $sce.trustAsHtml('No Readme File');
                    });
                }
            },

            getErrorFromResponse: function (response) {
                if (response && response.data) {
                    if (typeof response.data === 'string') {
                        return response.data;
                    } else {
                        return response.data.message || defaultError;
                    }
                } else {
                    return defaultError;
                }
            }
        };
    }]);

    catalog.factory('Github', ['$http', function ($http) {

        return {
            getRepositories: function () {
                return $http({
                    method: 'GET',
                    url: endpoint + githubQuery
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
            }
        };
    }]);

    catalog.factory('CloudifyManager', ['$http', function ($http) {

        return {
            upload: function doUpload(endpoint, blueprint) {
                var queryParams = [], query;
                if (blueprint.path) {
                    queryParams.push('application_file_name=' + encodeURIComponent(blueprint.path));
                }
                if (blueprint.url) {
                    queryParams.push('blueprint_archive_url=' + encodeURIComponent(blueprint.url));
                }
                query = queryParams.length ? ('?' + queryParams.join('&')) : '';

                return $http({
                    method: 'PUT',
                    url: endpoint + '/blueprints/' + encodeURIComponent(blueprint.id) + query
                });
            }
        };
    }]);
})();
