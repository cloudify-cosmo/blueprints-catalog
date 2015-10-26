'use strict';

angular.module('blueprintingCatalogWidget', [])

    .constant('widgetDefaults', {
        repoGroups: {
            blueprints: {
                order: 1,
                name: 'blueprints',
                githubQuery: '-example+in:name+fork:true+user:cloudify-examples',
                canUpload: true
            },
            plugins: {
                order: 2,
                name: 'plugins',
                githubQuery: '-plugin+in:name+fork:true+user:cloudify-examples'
            },
            integrations: {
                order: 3,
                name: 'integrations',
                githubQuery: '-integration+in:name+fork:true+user:cloudify-examples'
            }
        }
    });
