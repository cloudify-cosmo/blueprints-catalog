'use strict';

(function () {
    var LOGGER = 'BCW DIRECTIVES';

    angular.module('blueprintingCatalogWidget')

        .directive('blueprintingCatalog', ['Github', 'CloudifyManager', 'CatalogHelper', 'WidgetConfig', '$location', '$q', '$log',
            function (Github, CloudifyManager, CatalogHelper, WidgetConfig, $location, $q, $log) {

                return {
                    restrict: 'A',
                    scope: {
                        blueprintsGithubQuery: '@catalogBlueprintsGithubQuery',
                        pluginsGithubQuery: '@catalogPluginsGithubQuery',
                        integrationsGithubQuery: '@catalogIntegrationsGithubQuery',
                        listTitle: '@catalogListTitle',
                        listDescription: '@catalogListDescription',
                        howUseLink: '@catalogHowUseLink',
                        howContributeLink: '@catalogHowContributeLink',
                        backText: '@catalogBackText',
                        catalogDefaultManager: '@catalogDefaultManager',
                        catalogCorsProxy: '@catalogCorsProxy',
                        defaultVersion: '@catalogDefaultVersion',
                        defaultVersionFallback: '@catalogDefaultVersionFallback'
                    },
                    templateUrl: 'blueprinting_catalog_widget_tpl.html',
                    link: function ($scope) {
                        WidgetConfig.initConfig($scope);

                        $scope.groups = WidgetConfig.getRepoGroups();

                        var reposDefers = [];
                        angular.forEach($scope.groups, function (model, type) {
                            model.loading = true;
                            reposDefers.push(Github.getRepositories(model.githubQuery).then(function (response) {
                                $log.debug(LOGGER, 'fetched repos ', type, response);

                                var repos = response.data && response.data.items || [];
                                for (var i = 0, len = repos.length; i < len; i++) {
                                    repos[i].canUpload = !!model.canUpload;
                                }
                                model.repos = repos;
                            }, CatalogHelper.handleGithubLimit($scope)).finally(function () {
                                model.loading = false;
                            }));
                        });

                        $location.search('list', true);
                        $scope.$watch(function () {
                            return $location.search().repo;
                        }, function (repoId) {
                            if (repoId) {
                                $q.all(reposDefers).then(function () {
                                    var repos;
                                    for (var type in $scope.groups) {
                                        if ($scope.groups.hasOwnProperty(type)) {
                                            repos = $scope.groups[type].repos;
                                            for (var i = 0, len = repos.length, repo; i < len; i++) {
                                                repo = repos[i];
                                                if (repo.id === +repoId) {
                                                    $scope.showDetails(repo);
                                                    return;
                                                }
                                            }
                                        }
                                    }
                                });
                            } else {
                                $scope.showList();
                            }
                        });

                        $scope.navigateToDetails = function (repo) {
                            $location.search('repo', repo.id);
                        };

                        $scope.navigateToList = function () {
                            $location.replace();
                            $location.search('repo', null); //do not use NULL in order to avoid full page reload
                        };

                        $scope.showDetails = function (repo) {
                            $q.when(CatalogHelper.fillVersions(repo, $scope), function () {
                                if (repo.currentVersion) {
                                    CatalogHelper.fillReadme(repo, repo.currentVersion, $scope);
                                }
                            });

                            $scope.currentRepo = repo;
                        };

                        $scope.switchVersion = function (version) {
                            CatalogHelper.changeVersion($scope.currentRepo, version, $scope);
                        };

                        $scope.showList = function () {
                            $scope.currentRepo = undefined;
                        };

                        $scope.showUpload = function (repo) {
                            $log.debug(LOGGER, 'show upload', repo);

                            $q.when(CatalogHelper.fillVersions(repo, $scope), function () {
                                if (repo.currentVersion) {
                                    $scope.blueprint.url = repo.html_url + '/archive/' + repo.currentVersion.name + '.zip';
                                    $q.when(CatalogHelper.fillBlueprints(repo, repo.currentVersion, $scope), function () {
                                        var files = repo.blueprintFiles[repo.currentVersion.name];
                                        $scope.blueprint.path = files && files[0] || '';
                                    });
                                }
                            });

                            $scope.managerEndpoint = WidgetConfig.getDefaultManager();
                            $scope.blueprint = {
                                id: repo.name
                            };

                            $scope.uploadRepo = repo;
                        };

                        $scope.selectNewVersion = function (version) {
                            var repo = $scope.uploadRepo;

                            $scope.blueprint.url = repo.html_url + '/archive/' + version.name + '.zip';

                            $q.when(CatalogHelper.changeVersion(repo, version, $scope), function () {
                                if ($scope.blueprint) {
                                    $scope.blueprint.path = repo.blueprintFiles[version.name][0];
                                }
                            });
                        };

                        $scope.closeUpload = function () {
                            $scope.error = undefined;
                            $scope.uploadRepo = undefined;
                            $scope.blueprint = undefined;
                        };

                        $scope.uploadBlueprint = function () {
                            $log.debug(LOGGER, 'do upload');

                            if ($scope.blueprintForm.$valid) {

                                $scope.processing = true;
                                $scope.error = undefined;
                                CloudifyManager.upload($scope.managerEndpoint, $scope.blueprint, WidgetConfig.getCorsProxy())
                                    .then(function () {
                                        $scope.uploadRepo = undefined;
                                    }, function (response) {
                                        $log.debug(LOGGER, 'upload failed', response);

                                        $scope.error = CatalogHelper.getErrorFromResponse(response);
                                    })
                                    .finally(function () {
                                        $scope.processing = false;
                                    });
                            }
                        };
                    }
                };

            }])

        .directive('reposList', [function () {
            return {
                restrict: 'E',
                replace: true,
                scope: {
                    repos: '=',
                    type: '=',
                    loading: '=',
                    canUpload: '=',
                    showDetails: '&',
                    showUpload: '&'
                },
                templateUrl: 'repos_list_tpl.html'
            };
        }])

        .directive('copyToClipboard', ['$window', '$log', function ($window, $log) {
            return {
                restrict: 'A',
                scope: {
                    text: '='
                },
                link: function (scope, element) {

                    var _document = $window.document;

                    element.on('click', function () {
                        copy(scope.text);
                    });

                    function copy(text) {
                        var el = createHiddenTextarea(text);
                        _document.body.appendChild(el);
                        try {
                            copyText(el);

                            $log.debug(LOGGER, 'copied: ' + text);
                        } catch (err) {
                            $log.warn(LOGGER, 'command not supported by your browser', err);
                            $log.warn(LOGGER, 'using fallback impl.');

                            $window.prompt("Copy to clipboard & hit enter", text);
                        }
                        _document.body.removeChild(el);
                    }

                    function createHiddenTextarea(text) {
                        var el = _document.createElement('textarea');
                        el.style.position = 'absolute';
                        el.style.left = '-5000px';
                        el.textContent = text;
                        return el;
                    }

                    function copyText(el) {
                        el.select();

                        if (!_document.execCommand('copy')) {
                            throw('failed to  copy');
                        }
                    }
                }
            };
        }]);
})();
