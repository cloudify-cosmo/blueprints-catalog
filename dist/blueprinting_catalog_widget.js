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
angular.module('blueprintingCatalogWidget').run(['$templateCache', function($templateCache) {
  'use strict';

  $templateCache.put('blueprinting_catalog_widget_tpl.html',
    "<section class=\"bl-catalog\"> <div ng-show=\"!currentRepo\"> <div> <h1>{{::listTitle}}</h1> <p>{{::listDescription}}</p> </div> <div> <table> <thead> <tr> <th>Name</th> <th>Description</th> <th>Source</th> <th>Action</th> </tr> </thead> <tr ng-show=\"!loading && !repos.length\"> <td colspan=\"4\">No Data Found</td> </tr> <tr ng-show=\"loading\"> <td colspan=\"4\">Loading...</td> </tr> <tr ng-repeat=\"repo in repos\"> <td> <a href ng-click=\"showDetails(repo);\">{{::repo.name}}</a> </td> <td> {{::repo.description}} </td> <td> <a href=\"{{::repo.html_url}}\" target=\"_tab_{{::repo.id}}\">Source</a> </td> <td> <a href ng-click=\"showUpload(repo);\">Upload to Manager</a> </td> </tr> </table> </div> </div> <div ng-show=\"currentRepo\"> <div> <h1> <a href ng-click=\"showList();\" class=\"to-list\"></a> {{currentRepo.name}} </h1> <ul class=\"action-links\"> <li><a href=\"{{currentRepo.html_url}}/tree/{{currentRepo.currentVersion}}\" target=\"_tab_{{currentRepo.id}}\">Source</a></li> <li><a href=\"{{currentRepo.html_url}}/archive/{{currentRepo.currentVersion}}.zip\">Download</a></li> <li><a href ng-click=\"showUpload(currentRepo);\">Upload to Manager</a></li> </ul> <div class=\"versions-list\"> <label>Branches & Tags:</label> <ul> <li ng-repeat=\"v in currentRepo.versionsList\" ng-switch=\"v.name === currentRepo.currentVersion\"> <span ng-switch-when=\"true\" class=\"label\">{{v.name}}</span> <a ng-click=\"changeVersion(v.name);\" href ng-switch-when=\"false\" class=\"label\">{{v.name}}</a> </li> </ul> </div> </div> <section> <hr> <div ng-bind-html=\"currentRepo.readmeContents[currentRepo.currentVersion]\"></div> </section> </div> <div ng-show=\"uploadRepo\" class=\"modal-backdrop\"></div> <div class=\"modal\" ng-show=\"uploadRepo\"> <div class=\"modal-dialog\"> <div class=\"modal-content no-header\"> <div class=\"modal-body\"> <form novalidate name=\"blueprintForm\"> <label> Blueprint Name<br> <input type=\"text\" ng-model=\"blueprint.id\" placeholder=\"enter blueprint name\" required> </label> <label> Manager Endpoint URL<br> <input type=\"url\" ng-model=\"managerEndpoint\" placeholder=\"enter manager url\" required> </label> <label> Blueprint File Name<br> <input type=\"text\" ng-model=\"blueprint.path\" placeholder=\"enter blueprint file name\" required> </label> <label> Source<br> <select ng-model=\"blueprint.url\"> <option ng-repeat=\"v in uploadRepo.versionsList\" value=\"{{uploadRepo.html_url}}/archive/{{v.name}}.zip\" ng-selected=\"b.name === uploadRepo.currentVersion\"> {{v.name}} </option> </select> </label> <div class=\"alert alert-danger\" ng-show=\"error\">{{error}}</div> </form> <div class=\"modal-buttons\"> <button class=\"btn btn-default\" ng-disabled=\"processing\" ng-click=\"closeUpload();\">Cancel</button> <button class=\"btn btn-primary\" ng-disabled=\"processing || blueprintForm.$invalid\" ng-click=\"uploadBlueprint();\"> <span ng-show=\"processing\">Uploading...</span> <span ng-hide=\"processing\">Upload</span> </button> </div> </div> </div> </div> </div> </section>"
  );

}]);
