/**

 Copyright 2021 University of Denver

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.

 */

const userModule = (function () {

    'use strict';

    const api = configModule.getApi();
    const endpoints = apiModule.endpoints();
    let obj = {};

    /**
     * Renders user profile data
     * @param data
     */
    const renderUsers = function (data) {

        if (data.length === 0) {
            domModule.html('.loading', null);
            domModule.html('.table', null);
            helperModule.renderError('Unable to get users.');
            return false;
        }

        let actives = '';
        let inactives = '';
        let user;
        let inactive = [];

        for (let i = 0; i < data.length; i++) {

            user = data[i];

            if (user.is_active === 1) {

                actives += '<tr>';
                actives += '<td>' + DOMPurify.sanitize(user.first_name) + '</td>';
                actives += '<td>' + DOMPurify.sanitize(user.last_name) + '</td>';
                actives += '<td>' + DOMPurify.sanitize(user.email) + '</td>';
                actives += '<td>Active</td>';
                actives += '<td>';
                actives += '&nbsp;';
                actives += '<a class="btn btn-xs btn-default" href="/bookshelf/dashboard/users/edit?id=' + DOMPurify.sanitize(user.id) + '" title="Edit User"><i class="fa fa-edit"></i></a>&nbsp;&nbsp;&nbsp;&nbsp;';
                actives += '</td>';
                actives += '</tr>';

            }

            if (user.is_active === 0) {
                inactive.push(user);
            }
        }

        for (let i = 0; i < inactive.length; i++) {

            user = inactive[i];

            inactives += '<tr>';
            inactives += '<td>' + DOMPurify.sanitize(user.first_name) + '</td>';
            inactives += '<td>' + DOMPurify.sanitize(user.last_name) + '</td>';
            inactives += '<td>' + DOMPurify.sanitize(user.email) + '</td>';
            inactives += '<td style="background: red;color: white">Inactive</td>';
            inactives += '<td>';
            inactives += '&nbsp;';
            inactives += '<a class="btn btn-xs btn-default" href="/bookshelf/dashboard/users/edit?id=' + DOMPurify.sanitize(user.id) + '" title="Edit User"><i class="fa fa-edit"></i></a>&nbsp;&nbsp;&nbsp;&nbsp;';
            inactives += '<a class="btn btn-xs btn-danger" href="/bookshelf/dashboard/users/delete?id=' + DOMPurify.sanitize(user.id) + '" title="Delete User"><i class="fa fa-times"></i></a>';
            inactives += '</td>';
            inactives += '</tr>';
        }

        if (inactive.length === 0) {
            domModule.hide('#inactive');
        }

        domModule.html('#active-users', actives);
        domModule.html('#inactive-users', inactives);
        domModule.html('.loading', null);

        return false;
    };

    /**
     * Renders user profile data for edit form
     * @param data
     */
    const renderUserDetails = function (data) {

        if (data.length === 0) {
            domModule.html('#user-update-form', null);
            helperModule.renderError('Unable to get profile data.');
            setTimeout(function () {
                window.location.replace('/bookshelf/dashboard/users');
            }, 3000);
            return false;
        }

        let user;

        for (let i = 0; i < data.length; i++) {

            user = data[i];

            domModule.val('#id', user.id);
            domModule.val('#du_id', user.du_id);
            domModule.val('#email', user.email);
            domModule.val('#first_name', user.first_name);
            domModule.val('#last_name', user.last_name);

            if (user.is_active === 1) {
                $('#is_active').prop('checked', true);
            } else {
                $('#is_active').prop('checked', false);
            }
        }

        domModule.html('.loading', null);

        return false;
    };

    /**
     * Gets all users
     */
    obj.getUsers = function () {

        let token = userModule.getUserToken();
        let url = api + endpoints.users,
            request = new Request(url, {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': token
                }
            });

        const callback = function (response) {

            if (response.status === 200) {

                response.json().then(function (data) {
                    renderUsers(data);
                });

            } else if (response.status === 401) {

                helperModule.renderError('Error: (HTTP status ' + response.status + '). Your session has expired.  You will be redirected to the login page momentarily.');

                setTimeout(function () {
                    window.location.replace('/bookshelf/login');
                }, 3000);

            } else {
                helperModule.renderError('Error: (HTTP status ' + response.status + '). Unable to retrieve users.');
            }
        };

        httpModule.req(request, callback);

        return false;
    };

    /**
     * Retrieves user profile data for edit form
     */
    obj.getUserDetails = function () {

        let id = helperModule.getParameterByName('id');
        let token = userModule.getUserToken();
        let url = api + endpoints.users + '?id=' + id,
            request = new Request(url, {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': token
                }
            });

        const callback = function (response) {

            if (response.status === 200) {

                response.json().then(function (data) {
                    renderUserDetails(data);
                });

            } else if (response.status === 401) {

                helperModule.renderError('Error: (HTTP status ' + response.status + '). Your session has expired.  You will be redirected to the login page momentarily.');

                setTimeout(function () {
                    window.location.replace('/bookshelf/login');
                }, 3000);

            } else {
                helperModule.renderError('Error: (HTTP status ' + response.status + '). Unable to retrieve users.');
            }
        };

        httpModule.req(request, callback);

        return false;
    };

    /**
     * Checks if user data is in session storage
     * @returns {boolean}
     */
    obj.checkUserData = function () {

        let data = window.sessionStorage.getItem('bookshelf_user');

        if (data !== null) {
            return true;
        }

        return false;
    };

    /**
     * Renders authenticated username in top menu bar
     */
    obj.renderUserName = function () {

        domModule.html('.username', '<strong>Loading...</strong>');

        setTimeout(function () {

            let data = JSON.parse(window.sessionStorage.getItem('bookshelf_user'));

            if (data !== null) {

                domModule.html('.username', '<strong>' + DOMPurify.sanitize(data.name) + '</strong>');

            } else if (data === null && domModule.html('.username')) {

                 helperModule.renderError('Unable to get user profile data.');

                 setTimeout(function () {
                     window.location.replace('/bookshelf/login');
                 }, 3000);
            }

        }, 500);
    };

    /**
     * Retrieves user form data
     * @param id
     * @returns {string}
     */
    const getUserFormData = function (id) {
        return domModule.serialize(id);
    };

    /**
     * Gets update data
     * @returns {{}}
     */
    const getUserFormUpateData = function () {

        let User = {};
        User.id = domModule.val('#id', null);
        User.first_name = domModule.val('#first_name', null);
        User.last_name = domModule.val('#last_name', null);

        if ($('#is_active').prop('checked')) {
            User.is_active = 1;
        } else {
            User.is_active = 0;
        }

        return User;
    };

    /**
     * Gets user's full name
     * @returns {*|Color}
     */
    obj.getUserFullName = function () {
        let data = JSON.parse(window.sessionStorage.getItem('bookshelf_user'));
        return DOMPurify.sanitize(data.name);
    };

    /**
     * Adds new user to repository
     */
    const addUser = function () {

        let user = getUserFormData('#user-add-form');
        let arr = user.split('&');
        let obj = {};

        domModule.hide('#user-add-form');
        domModule.html('#message', '<div class="alert alert-info">Saving User...</div>');

        for (let i=0;i<arr.length;i++) {
            let propsVal = decodeURIComponent(arr[i]).split('=');
            obj[propsVal[0]] = propsVal[1];
        }

        let token = userModule.getUserToken();
        let url = api + endpoints.users,
            request = new Request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': token
                },
                body: JSON.stringify(obj),
                mode: 'cors'
            });

        const callback = function (response) {

            if (response.status === 201) {

                domModule.html('#message', '<div class="alert alert-success">User created</div>');
                domModule.hide('#user-add-form');
                document.querySelector('#user-add-form').reset();

                setTimeout(function () {
                    domModule.html('#message', null);
                    domModule.show('#user-add-form');
                }, 3000);

                return false;

            } else if (response.status === 401) {

                response.json().then(function (response) {

                    helperModule.renderError('Error: (HTTP status ' + response.status + '). Your session has expired.  You will be redirected to the login page momentarily.');

                    setTimeout(function () {
                        window.location.replace('/bookshelf/login');
                    }, 3000);
                });

            } else if (response.status === 200) {

                domModule.html('#message', '<div class="alert alert-warning">User with DU ID ' + obj.du_id + ' is already in the system</div>');
                domModule.show('#user-add-form');

            } else {
                helperModule.renderError('Error: (HTTP status ' + response.status + ').  Unable to add user.');
            }
        };

        httpModule.req(request, callback);
    };

    /**
     * Updates user data
     */
    const updateUser = function () {

        let obj = getUserFormUpateData();
        domModule.hide('#user-update-form');
        domModule.html('#message', '<div class="alert alert-info">Updating User...</div>');

        let token = userModule.getUserToken();
        let url = api + endpoints.users,
            request = new Request(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': token
                },
                body: JSON.stringify(obj),
                mode: 'cors'
            });

        const callback = function (response) {

            if (response.status === 201) {

                domModule.html('#message', '<div class="alert alert-success">User updated</div>');
                domModule.hide('#user-update-form');
                setTimeout(function () {
                    domModule.html('#message', null);
                    window.location.replace('/bookshelf/dashboard/users');
                }, 3000);

                return false;

            } else if (response.status === 401) {

                response.json().then(function (response) {

                    helperModule.renderError('Error: (HTTP status ' + response.status + '). Your session has expired.  You will be redirected to the login page momentarily.');

                    setTimeout(function () {
                        window.location.replace('/bookshelf/login');
                    }, 3000);
                });

            } else {
                helperModule.renderError('Error: (HTTP status ' + response.status + ').  Unable to update user.');
            }
        };

        httpModule.req(request, callback);
    };

    /**
     * Deletes user data
     */
    obj.deleteUser = function () {

        let id = helperModule.getParameterByName('id');
        domModule.hide('#user-delete-form');
        domModule.html('#message', '<div class="alert alert-info">Deleting User...</div>');

        let token = userModule.getUserToken();
        let url = api + endpoints.users + '?id=' + id,
            request = new Request(url, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'x-access-token': token
                },
                mode: 'cors'
            });

        const callback = function (response) {

            if (response.status === 204) {

                domModule.html('#message', '<div class="alert alert-success">User deleted</div>');
                setTimeout(function () {
                    domModule.html('#message', null);
                    window.location.replace('/bookshelf/dashboard/users');
                }, 2000);

                return false;

            } else if (response.status === 401) {

                response.json().then(function (response) {

                    helperModule.renderError('Error: (HTTP status ' + response.status + '). Your session has expired.  You will be redirected to the login page momentarily.');

                    setTimeout(function () {
                        window.location.replace('/bookshelf/login');
                    }, 3000);
                });

            } else {
                helperModule.renderError('Error: (HTTP status ' + response.status + ').  Unable to delete user.');
            }
        };

        httpModule.req(request, callback);
    };

    /**
     * Alerts user that deleting a record is permanent
     */
    obj.deleteAlert = function() {

        swal({
            title: "Are you sure?",
            text: "Once deleted, you will not be able to recover this record!",
            icon: "warning",
            buttons: true,
            dangerMode: true,
        })
            .then((willDelete) => {

                if (willDelete) {
                    userModule.deleteUser();
                    swal("The record has been deleted!", {
                        icon: "success",
                    });
                }
            });
    }

    /**
     * Applies user form validation when adding new user
     */
    obj.userFormValidation = function () {

        document.addEventListener('DOMContentLoaded', function() {
            $('#user-add-form').validate({
                submitHandler: function () {
                    addUser();
                }
            });
        });
    };

    /**
     * Applies user form validation when updating a user
     */
    obj.userUpdateFormValidation = function () {

        document.addEventListener('DOMContentLoaded', function() {
            $('#user-update-form').validate({
                submitHandler: function () {
                    updateUser();
                }
            });
        });
    };

    /**
     * Gets token from session storage
     * @returns {*|Color}
     */
    obj.getUserToken = function () {

        let data = JSON.parse(window.sessionStorage.getItem('bookshelf_user_token'));

        if (data !== null && data.token === null) {

            setTimeout(function () {
                // window.location.replace('/bookshelf/login');
            }, 0);

        } else if (data === null) {
            window.location.replace('/bookshelf/login');
        } else {
            return DOMPurify.sanitize(data.token);
        }
    };

    /**
     * Gets user profile data after authentication
     */
    obj.getAuthUserData = function () {

        let uid = helperModule.getParameterByName('uid');
        userModule.saveToken();

        if (uid !== null) {

            let token = userModule.getUserToken();
            let url = api + endpoints.users + '?id=' + uid,
                request = new Request(url, {
                    method: 'GET',
                    mode: 'cors',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-access-token': token
                    }
                });

            const callback = function (response) {

                if (response.status === 200) {

                    response.json().then(function (data) {
                        userModule.saveUserAuthData(data);
                        userModule.renderUserName();
                    });

                } else if (response.status === 401) {

                    helperModule.renderError('Error: (HTTP status ' + response.status + '). Your session has expired.  You will be redirected to the login page momentarily.');

                    setTimeout(function () {
                        window.location.replace('/bookshelf/login');
                    }, 3000);

                } else {
                    helperModule.renderError('Error: (HTTP status ' + response.status + '). Unable to retrieve user profile.');
                    window.location.replace('/bookshelf/login');
                }
            };

            httpModule.req(request, callback);

        } else {
            userModule.renderUserName();
        }
    };

    /**
     * Destroys session data and redirects user to login
     */
    obj.sessionExpired = function () {

        obj.reset();

        if (window.sessionStorage.getItem('bookshelf_user_token') === null) {

            document.querySelector('#logout-message').innerHTML = 'Logging out...';

            for (let i=0;i<20;i++) {
                history.replaceState({}, '', '/bookshelf/logout');
                history.pushState({}, '', '/bookshelf/logout');
            }

            setTimeout(function () {
                document.querySelector('#logout-message').innerHTML = 'Logout';
                window.location.replace('/bookshelf/logout');
                }, 50);
        }

        return false;
    };

    /**
     * Saves user profile data to session storage
     * @param data
     */
    obj.saveUserAuthData = function (data) {

        let userObj = {
            uid: DOMPurify.sanitize(data[0].id),
            name: DOMPurify.sanitize(data[0].first_name) + ' ' + DOMPurify.sanitize(data[0].last_name)
        };

        window.sessionStorage.setItem('bookshelf_user', JSON.stringify(userObj));
    };

    /**
     * Gets session token from URL params
     */
    obj.saveToken = function () {

        let token = helperModule.getParameterByName('t');

        if (token !== null) {

            let data = {
                token: DOMPurify.sanitize(token)
            };

            window.sessionStorage.setItem('bookshelf_user_token', JSON.stringify(data));
        }
    };

    /**
     * Clears out session storage - used when user logs out
     */
    obj.reset = function () {
        window.sessionStorage.clear();
    };

    obj.init = function () {
        obj.renderUserName();
        document.querySelector('#logout').addEventListener('click', obj.sessionExpired);
    };

    return obj;

}());

userModule.init();
