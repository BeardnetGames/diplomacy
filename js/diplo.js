var diploApp = angular.module('diploApp', ['ui.router', 'ngRoute']);

diploApp

/**
 * Authentication events.
 */
.constant('AUTH_EVENTS', {
	loginSuccess: 'auth-login-success',
	loginFailed: 'auth-login-failed',
	logoutSuccess: 'auth-logout-success',
	sessionTimeout: 'auth-session-timeout',
	notAuthenticated: 'auth-not-authenticated',
	notAuthorized: 'auth-not-authorized'
})

/**
 * User roles.
 */
.constant('USER_ROLES', {
	all: '*',
	admin: 'admin',
	editor: 'editor',
	guest: 'guest'
})

/**
 * Configure UI routes.
 *
 * @param[in,out] $stateProvider UI-Router state manager
 * @param[in,out] $urlRouterProvider
 * @param[in] USER_ROLES Available user roles
 */
.config(function ($stateProvider, $routeProvider, USER_ROLES) {

	/* A UI state (ie. route) is configued using an objet with
	 * the following properties:
	 *
	 *   url: the URL associated with the state
	 *
	 *   templateUrl: the URL from which to load the template
	 *
	 *   controller: controller to manage route
	 *
	 *   data: custom data available to the state
	 */

	$stateProvider

	// This is here just for show
	.state('dashboard', {
		url: '/dashboard',
		templateUrl: 'dashboard/index.html',
		data: {
			authorizedRoles: [USER_ROLES.admin, USER_ROLES.editor]
		}
	})

	// Login page
	.state('login', {
		url: '/login',
		templateUrl: 'partials/login.html',
		controller: 'LoginController',
		data: {
			authorizedRoles: [USER_ROLES.all]
		}
	});

	$routeProvider.otherwise({ redirectTo: '/login' });
})

/**
 * Register AuthInterceptor to occur before any response from the server
 * is handled.
 */
.config(function ($httpProvider) {
	$httpProvider.interceptors.push([
		'$injector',
		function ($injector) {
			return $injector.get('AuthInterceptor');
		}
	]);
})

/**
 * Service to authenticate a user.
 *
 * @param[in] $http Angular service to communicate with remote server
 * @param[in,out] Session Service to manage user sessions
 */
.factory('AuthService', function ($http, Session, USER_ROLES) {
	var that = {

		/**
		 * Authenticate user with server.
		 *
		 * @param[in] credentials User authentication credentials
		 */
		login: function (credentials) {
			return $http
			.post('/auth', credentials)
			.then(function (res) {
				Session.create(res.id, res.userid, res.role);
			});
		},

		/**
		 * Check if the user is authenticated.
		 *
		 * @returns true if the user is authenticated and false otherwise.
		 */
		isAuthenticated: function () {
			return !!Session.userId;
		},

		/**
		 * Check if user is in access group.
		 *
		 * @param[in] authorizedRoles Valid roles
		 *
		 * @returns true if the user has one of the valid roles and false
		 *          otherwise.
		 */
		isAuthorized: function (authorizedRoles) {
			if (!angular.isArray(authorizedRoles)) {
				authorizedRoles = [authorizedRoles];
			}

			if (authorizedRoles.indexOf(USER_ROLES.all) !== -1)
				return true;

			return (this.isAuthenticated() &&
					authorizedRoles.indexOf(Session.userRole) !== -1);
		}
	};

	return that;
})

/**
 * Notifies application components of authentication failure via broadcast
 * to the $rootScope.
 *
 * @param[in,out] $rootScope Root scope of the application
 * @param[in,out] $q HTTP response promise
 * @param[in] AUTH_EVENTS Authentication events
 */
.factory('AuthInterceptor', function ($rootScope, $q, AUTH_EVENTS) {
	var that = {

		/**
		 * Handler associated with the 'responseError' interceptor. Triggers
		 * a global notification of failure.
		 *
		 * @param[in] reponse Request response.
		 */
		responseError: function (response) {
			switch (reponse.status) {
				case 401: {
					$rootScope.$broadcast(AUTH_EVENTS.notAuthenticated, reponse);
					break;
				}
				case 403: {
					$rootScope.$broadcast(AUTH_EVENTS.notAuthorized, reponse);
					break;
				}
				case 419: {
					$rootScope.$broadcast(AUTH_EVENTS.sessionTimeout, response);
					break;
				}
			}

			return $q.reject(response);
		}
	};

	return that;
})

/**
 * Service to manage user sessions.
 */
.service('Session', function () {

	/**
	 * Populate the session with the user's credentials.
	 *
	 * @param[in] sessionId User's session id
	 * @param[in] userId User's id
	 * @param[in] userRole User's role
	 */
	this.create = function (sessionId, userId, userRole) {
		this.id = sessionId;
		this.userId = userId;
		this.userRole = userRole;
	};

	/**
	 * Destroys the user's session.
	 */
	this.destroy = function () {
		this.id = null;
		this.userId = null;
		this.userRole = null;
	};
})

/**
 * Controller for the login view.
 */
.controller('LoginController', function ($scope, $rootScope, AUTH_EVENTS, AuthService) {
	$scope.login = function () {
		console.log('login!');
	};
})

/**
 * Bootstrap user session.
 *
 * @param[in,out] Session User session service
 * @param[in] USER_ROLES User roles
 */
.run(function (Session, USER_ROLES) {
	Session.create(null, null, USER_ROLES.guest);
})

/**
 * Check authentication and authorization on state changes.
 */
.run(function ($rootScope, AUTH_EVENTS, AuthService) {
	$rootScope.$on('$stateChangeStart', function (event, next) {
		var authorizedRoles = next.data.authorizedRoles;

		if (!AuthService.isAuthorized(authorizedRoles)) {
			event.preventDefault();

			if (AuthService.isAuthenticated()) {
				// user is not allowed
				$rootScope.$broadcast(AUTH_EVENTS.notAuthorized);
			}
			else {
				// user is not logged int
				$rootScope.$broadcast(AUTH_EVENTS.notAuthenticated);
			}
		}
	});
})

/**
 * When submitting a form, trigger events on all of the input
 * elements. This is necessary because some browsers don't
 * trigger events when they auto-fill form fields.
 *
 * @param[in,out] $timeout Angular's wrapper for window.setTimeout
 */
.directive('formAutofillFix', function ($timeout) {
	var that = function (scope, element, attrs) {
		element.prop('method', 'post');

		if (attrs.ngSubmit) {
			$timeout(function () {
				element

				// unbind the current handler
				.unbind('submit')

				.bind('submit', function (event) {
					event.preventDefault();

					// fire events to trigger $scope update
					element
					.find('input, textarea, select')
					.trigger('input')
					.trigger('change')
					.trigger('keydown');

					// submit form
					scope.$apply(attrs.ngSubmit);
				});
			});
		}
	};

	return that;
})

;
