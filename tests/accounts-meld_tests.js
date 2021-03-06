if (Meteor.isServer) {
    var http = Npm.require("http");

    // server
    Meteor.publish("usersData", function () {
        return Meteor.users.find();
    });

    // connect middleware
    OAuth._requestHandlers["3"] = function(service, query, res) {
        // check if user authorized access
        if (!query.error) {
            // Prepare the login results before returning.
            // Run service-specific handler.
            var oauthResult = service.handleOauthRequest(query);
            // Store the login result so it can be retrieved in another
            // browser tab by the result handler
            OAuth._storePendingCredential(query.state, {
                serviceName: service.serviceName,
                serviceData: oauthResult.serviceData,
                options: oauthResult.options
            });
        }
        // Either close the window, redirect, or render nothing
        // if all else fails
        OAuth._renderOauthResults(res, query);
    };

    Meteor.methods({
        assertMeldActionsCorrect: function(user, usersToMeld){
            var userId = Meteor.users.findOne({ $or: [
                {username: user.username},
                {"profile.id" : user.profile.id},
            ]})._id;
            var results = _.map(usersToMeld, function(userToMeld){
                var userToMeldId = Meteor.users.findOne({ $or: [
                    {username: userToMeld.username},
                    {"profile.id" : userToMeld.profile.id},
                ]})._id;
                return MeldActions.findOne({
                    src_user_id: userToMeldId,
                    dst_user_id: userId,
                    meld: "ask"
                });
            }, {userId: userId});
            return _.all(results);
        },
        assertUsersMissing: function(users){
            var users_id = _.map(users, function(user){
                return {_id: user._id};
            });
            var found_users = Meteor.users.find({$or: users_id});
            if (found_users.count() === 0)
                return true;
        },
        getMeldActionsCount: function() {
            return MeldActions.find().count();
        },
        getUsersCount: function() {
            return Meteor.users.find().count();
        },
        getUserToken: function(user) {
            var userId = Meteor.users.findOne(user)._id;
            Accounts._insertLoginToken(userId, Accounts._generateStampedLoginToken());
            var hashedToken = Meteor.users.findOne(userId).services.resume.loginTokens[0].hashedToken;
            return hashedToken;
        },
        insertUser: function(user) {
            Meteor.users.insert(user);
        },
        loginUser: function(user) {
            var userId = Meteor.users.findOne(user)._id;
            this.setUserId(userId);
        },
        registerService: function(serviceName, user, callback) {
            var userServiceId = user.services[serviceName].id || Random.id();
            ServiceConfiguration.configurations.insert({
                service: serviceName
            });
            // register a fake login service
            OAuth.registerService(serviceName, 3, null, function(query) {
                return {
                    options: {
                      profile: user.profile
                    },
                    serviceData: user.services[serviceName],
                };
            });
            if (callback)
                callback();
        },
        setupTests: function() {
            Meteor.users.remove({});
            MeldActions.remove({});
        },
        unregisterService: function(serviceName) {
            OAuthTest.unregisterService(serviceName);
        },
        setAskBeforeMeld: function(value){
            AccountsMeld.configure({askBeforeMeld: value});
        }
    });
}


if (Meteor.isClient) {

    Meteor.subscribe("pendingMeldActions");
    MeldActions = new Meteor.Collection('meldActions');

    // Declares some dummy users to be used in different combinations
    //
    //  variable name  Service      Email     Verified
    //
    //  userPwd1_nV    password     pippo1    false
    //  userPwd1_V     password     pippo1    true
    //  userPwd2_nV    password     pippo2    false
    //  userPwd2_V     password     pippo2    true
    //  userFB2_nV     foobook      pippo1    false
    //  userFB2_V      foobook      pippo1    true
    //  userFB2_nV     foobook      pippo2    false
    //  userFB2_V      foobook      pippo2    true
    //  userLO1_nV     linkedout    pippo1    false
    //  userLO1_V      linkedout    pippo1    true
    //  userLO2_nV     linkedout    pippo2    false
    //  userLO2_V      linkedout    pippo2    true
    //

    // User registered with service password with non-verified email
    var userPwd1_nV = {
        username: Random.id(),
        email: "pippo1@example",
        emails: [{address: "pippo1@example.com", verified: false}],
        profile: {id: "password1-non-verified"},
        registered_emails: [{address: "pippo1@example.com", verified: false}],
        services: {password: {srp: SRP.generateVerifier("password1-non-verified")}}
    };
    // User registered with service password with Verified email
    var userPwd1_V = {
        username: Random.id(),
        email: "pippo1@example",
        emails: [{address: "pippo1@example.com", verified: true}],
        profile: {id: "password1-verified"},
        registered_emails: [{address: "pippo1@example.com", verified: true}],
        services: {password: {srp: SRP.generateVerifier("password1-verified")}}
    };
    // User registered with service password with non-Verified email
    var userPwd2_nV = {
        username: Random.id(),
        email: "pippo2@example",
        emails: [{address: "pippo2@example.com", verified: false}],
        profile: {id: "password2-non-verified"},
        registered_emails: [{address: "pippo2@example.com", verified: false}],
        services: {password: {srp: SRP.generateVerifier("password2-non-verified")}}
    };
    // User registered with service password with Verified email
    var userPwd2_V = {
        username: Random.id(),
        email: "pippo2@example",
        emails: [{address: "pippo2@example.com", verified: true}],
        profile: {id: "password2-verified"},
        registered_emails: [{address: "pippo2@example.com", verified: true}],
        services: {password: {srp: SRP.generateVerifier("password2-verified")}}
    };
    // User registered with service foobook with non-Verified email
    var userFB1_nV = {
        username: Random.id(),
        profile: {id: "foobook1-non-verified"},
        registered_emails: [{address: "pippo1@example.com", verified: false}],
        services: { "foobook": {
            "id": Random.id(),
            "emailAddress": "pippo1@example.com",
            "verified_email": false
        }}
    };
    // User registered with service foobook with Verified email
    var userFB1_V = {
        username: Random.id(),
        profile: {id: "foobook1-verified"},
        registered_emails: [{address: "pippo1@example.com", verified: true}],
        services: { "foobook": {
            "id": Random.id(),
            "emailAddress": "pippo1@example.com",
            "verified_email": true
        }}
    };
    // User registered with service foobook with non-Verified email
    var userFB2_nV = {
        username: Random.id(),
        profile: {id: "foobook2-non-verified"},
        registered_emails: [{address: "pippo2@example.com", verified: false}],
        services: { "foobook": {
            "id": Random.id(),
            "emailAddress": "pippo2@example.com",
            "verified_email": false
        }}
    };
    // User registered with service foobook with Verified email
    var userFB2_V = {
        username: Random.id(),
        profile: {id: "foobook2-verified"},
        registered_emails: [{address: "pippo2@example.com", verified: true}],
        services: { "foobook": {
            "id": Random.id(),
            "emailAddress": "pippo2@example.com",
            "verified_email": true
        }}
    };
    // User registered with service linkedout with non-Verified email
    var userLO1_nV = {
        username: Random.id(),
        profile: {id: "linkedout1-non-verified"},
        registered_emails: [{address: "pippo1@example.com", verified: false}],
        services: { "linkedout": {
            "id": Random.id(),
            "emailAddress": "pippo1@example.com",
            "verified_email": false
        }}
    };
    // User registered with service linkedout with Verified email
    var userLO1_V = {
        username: Random.id(),
        profile: {id: "linkedout1-verified"},
        registered_emails: [{address: "pippo1@example.com", verified: true}],
        services: { "linkedout": {
            "id": Random.id(),
            "emailAddress": "pippo1@example.com",
            "verified_email": true
        }}
    };
    // User registered with service linkedout with non-Verified email
    var userLO2_nV = {
        username: Random.id(),
        profile: {id: "linkedout2-non-verified"},
        registered_emails: [{address: "pippo2@example.com", verified: false}],
        services: { "linkedout": {
            "id": Random.id(),
            "emailAddress": "pippo2@example.com",
            "verified_email": false
        }}
    };
    // User registered with service linkedout with Verified email
    var userLO2_V = {
        username: Random.id(),
        profile: {id: "linkedout2-verified"},
        registered_emails: [{address: "pippo2@example.com", verified: true}],
        services: { "linkedout": {
            "id": Random.id(),
            "emailAddress": "pippo2@example.com",
            "verified_email": true,
        }}
    };

    // Declares some handy function for user management, login and testing
    var AlreadyExistingServiceAddedError = function(test, expect) {
        return expect(function(error) {
            test.equal(
                error.reason,
                "Another account registered with the same service was found!"
            );
        });
    };
    var AlreadyExistingServiceMeldedError = function(test, expect) {
        return expect(function(error) {
            test.equal(
                error.reason,
                "Another account registered with the same service was found, and melded with the current one!"
            );
        });
    };
    var askBeforeMeld = function(value){
        return function(test, expect) {
            Meteor.call("setAskBeforeMeld", value, justWait(test, expect));
        };
    };
    var assertMeldActionsCorrect = function(user, usersToMeld){
        return function(test, expect) {
            Meteor.call("assertMeldActionsCorrect", user, usersToMeld, expect(function(error, correct){
                test.isTrue(correct);
            }));
        };
    };
    var assertMeldActionsCount = function(count){
        return function(test, expect) {
            Meteor.call("getMeldActionsCount", expect(function(error, meldActionsCount){
                test.equal(meldActionsCount, count);
            }));
        };
    };
    var assertUsersCount = function(count){
        return function(test, expect) {
            Meteor.call("getUsersCount", expect(function(error, usersCount){
                test.equal(usersCount, count);
            }));
        };
    };
    var assertUsersMissing = function(users){
        return function(test, expect) {
            Meteor.call("assertUsersMissing", users, expect(function(error, correct){
                test.isTrue(correct);
            }));
        };
    };
    var insertUsers = function(users){
        return function(test, expect) {
            _.forEach(users, function(user){
                Meteor.call("insertUser", user, justWait(test, expect));
            });
        };
    };
    var loggedInAs = function(user) {
        return function(test, expect) {
            test.notEqual(Meteor.userId(), null);
            var user = Meteor.user();
            test.notEqual(user, null);
            if (user)
                test.equal(Meteor.user().profile.id, user.profile.id);
        };
    };
    var login3rdParty = function(test, expect) {
        var credentialSecret = OAuth._retrieveCredentialSecret(this.credentialToken) || null;
        Accounts.callLoginMethod({
            methodArguments: [{oauth: {
                    credentialToken: this.credentialToken,
                    credentialSecret: credentialSecret
            }}],
            userCallback: noError(test, expect)
        });
    };
    var login3rdPartyServiceAdded = function(test, expect) {
        var credentialSecret = OAuth._retrieveCredentialSecret(this.credentialToken) || null;
        Accounts.callLoginMethod({
            methodArguments: [{oauth: {
                    credentialToken: this.credentialToken,
                    credentialSecret: credentialSecret
            }}],
            userCallback: ServiceAddedError(test, expect)
        });
    };
    var login3rdPartyExistingServiceAdded = function(test, expect) {
        var credentialSecret = OAuth._retrieveCredentialSecret(this.credentialToken) || null;
        Accounts.callLoginMethod({
            methodArguments: [{oauth: {
                    credentialToken: this.credentialToken,
                    credentialSecret: credentialSecret
            }}],
            userCallback: AlreadyExistingServiceAddedError(test, expect)
        });
    };
    var login3rdPartyExistingServiceMelded = function(test, expect) {
        var credentialSecret = OAuth._retrieveCredentialSecret(this.credentialToken) || null;
        Accounts.callLoginMethod({
            methodArguments: [{oauth: {
                    credentialToken: this.credentialToken,
                    credentialSecret: credentialSecret
            }}],
            userCallback: AlreadyExistingServiceMeldedError(test, expect)
        });
    };
    var logoutStep = function(test, expect) {
        Meteor.logout(expect(function(error) {
            test.equal(error, undefined);
            test.equal(Meteor.user(), null);
        }));
    };
    var noError = function(test, expect) {
        return expect(function(error) {
            test.equal(error, undefined);
        });
    };
    var justWait = function(test, expect) {
        return expect(function() {});
    };
    var pwdLogin = function(user){
        return function (test, expect) {
            Meteor.loginWithPassword({username: user.username}, user.profile.id, noError(test, expect));
        };
    };
    var registerService = function(serviceName, user) {
        return function(test, expect) {
            Meteor.call("registerService", serviceName, user, justWait(test, expect));
        };
    };
    var resetAll = function(test, expect) {
        Meteor.call("setupTests", justWait(test, expect));
    };
    var ServiceAddedError = function(test, expect) {
        return expect(function(error) {
            test.equal(
                error.reason,
                "Service correctly added to the current user, no need to proceed!"
            );
        });
    };
    var start3rdPartyLogin = function(serviceName) {
        return function(test, expect) {
            var credentialToken = Random.id();
            this.credentialToken = credentialToken;
            Meteor.http.post(
                "/_oauth/" + serviceName + "?state=" + credentialToken,
                justWait(test, expect)
            );
        };
    };
    var unregisterService = function(serviceName){
        return function(test, expect) {
            Meteor.call("unregisterService", serviceName, justWait(test, expect));
        };
    };


    // -----------------------
    // Actual tests definition
    // -----------------------

    // Handy function for creating test sequences
    var testPwdLoginWithUsersNoMeld = function(testSequence, users){
        // The first user in list will be used to perform the login test
        testSequence.push.apply(testSequence, [
            // At first, makes tests with askBeforeMeld = false
            resetAll,
            insertUsers(users),
            assertUsersCount(users.length),
            askBeforeMeld(false),
            pwdLogin(users[0]),
            loggedInAs(users[0]),
            assertUsersCount(users.length),
            logoutStep,
            // Then, remakes same tests with askBeforeMeld = true
            resetAll,
            insertUsers(users),
            assertUsersCount(users.length),
            askBeforeMeld(true),
            pwdLogin(users[0]),
            loggedInAs(users[0]),
            assertMeldActionsCount(0),
            logoutStep,
        ]);
    };
    // No meld actions are expected to be created here...
    testSequence = [];
    testPwdLoginWithUsersNoMeld(testSequence, [userPwd1_nV,  userPwd2_nV]);
    testPwdLoginWithUsersNoMeld(testSequence, [userPwd1_nV,  userPwd2_V]);
    testPwdLoginWithUsersNoMeld(testSequence, [
        userPwd1_nV,
        userFB1_nV, userFB1_V, userFB2_nV, userFB2_V, userLO1_nV, userLO1_V, userLO2_nV, userLO2_V
    ]);
    testPwdLoginWithUsersNoMeld(testSequence, [userPwd1_V,  userPwd2_nV]);
    testPwdLoginWithUsersNoMeld(testSequence, [userPwd1_V,  userPwd2_V]);
    testPwdLoginWithUsersNoMeld(testSequence, [
        userPwd1_V,
        userFB1_nV, userFB2_nV, userFB2_V, userLO1_nV, userLO2_nV, userLO2_V
    ]);
    testSequence.push(resetAll);
    testAsyncMulti("accounts-meld - login with password (no melds)", testSequence);



    // Handy function for creating test sequences
    var test3rdPartyLoginWithUsersNoMeld = function(testSequence, userToLogInWith3rdParty, users){
        // The first user in list will be used to perform the pwd login
        var serviceName = _.keys(userToLogInWith3rdParty.services)[0];
        testSequence.push.apply(testSequence, [
            // At first, makes tests with askBeforeMeld = false
            resetAll,
            insertUsers(users),
            assertUsersCount(users.length),
            askBeforeMeld(false),
            registerService(serviceName, userToLogInWith3rdParty),
            start3rdPartyLogin(serviceName),
            login3rdParty,
            loggedInAs(userToLogInWith3rdParty),
            assertUsersCount(users.length + 1),
            logoutStep,
            unregisterService(serviceName),
            // Then, remakes same tests with askBeforeMeld = true
            resetAll,
            insertUsers(users),
            assertUsersCount(users.length),
            askBeforeMeld(true),
            registerService(serviceName, userToLogInWith3rdParty),
            start3rdPartyLogin(serviceName),
            login3rdParty,
            loggedInAs(userToLogInWith3rdParty),
            assertMeldActionsCount(0),
            logoutStep,
            unregisterService(serviceName),
        ]);
    };

    // No meld actions are expected to be created here...
    testSequence = [];
    test3rdPartyLoginWithUsersNoMeld(testSequence, userFB1_nV, []);
    test3rdPartyLoginWithUsersNoMeld(testSequence, userFB1_nV, [
        userPwd1_nV, userPwd2_nV
    ]);
    test3rdPartyLoginWithUsersNoMeld(testSequence, userFB1_nV, [
        userPwd1_V, userPwd2_V
    ]);
    test3rdPartyLoginWithUsersNoMeld(testSequence, userFB1_nV, [
        userFB1_V, userFB2_nV, userFB2_V, userLO1_nV, userLO1_V, userLO2_nV, userLO2_V
    ]);
    test3rdPartyLoginWithUsersNoMeld(testSequence, userFB1_V, [
        userFB1_nV, userFB2_nV, userFB2_V, userLO1_nV, userLO2_nV, userLO2_V
    ]);
    testSequence.push(resetAll);
    testAsyncMulti("accounts-meld - login with 3rd-party service tests (no melds)", testSequence);



    // Handy function for creating test sequences
    var testPwdLoginWithUsersWithMeld = function(testSequence, user, usersToMeld, otherUsers){
        // The first user in list will be used to perform the login test
        testSequence.push.apply(testSequence, [
            // At first, makes tests with askBeforeMeld = false
            resetAll,
            askBeforeMeld(false),
            insertUsers([user]),
            insertUsers(usersToMeld),
            insertUsers(otherUsers),
            assertUsersCount(1 + usersToMeld.length + otherUsers.length),
            pwdLogin(user),
            loggedInAs(user),
            assertUsersCount(1 + otherUsers.length),
            assertUsersMissing(usersToMeld),
            logoutStep,
            // Then, remakes same tests with askBeforeMeld = true
            resetAll,
            askBeforeMeld(true),
            insertUsers([user]),
            insertUsers(usersToMeld),
            insertUsers(otherUsers),
            assertUsersCount(1 + usersToMeld.length + otherUsers.length),
            pwdLogin(user),
            loggedInAs(user),
            assertMeldActionsCount(usersToMeld.length),
            assertMeldActionsCorrect(user, usersToMeld),
            logoutStep,
        ]);
    };
    // A meld action is expected to be created here...
    testSequence = [];
    testPwdLoginWithUsersWithMeld(testSequence,
        userPwd1_V,
        [userFB1_V],
        [userFB2_nV, userFB2_V, userLO1_nV, userLO2_nV, userLO2_V]
    );
    testPwdLoginWithUsersWithMeld(testSequence,
        userPwd1_V,
        [userFB1_V, userLO1_V],
        [userFB2_nV, userFB2_V, userLO1_nV, userLO2_nV, userLO2_V]
    );
    testSequence.push(resetAll);
    testAsyncMulti("accounts-meld - login with password and meld", testSequence);



    // Handy function for creating test sequences
    var test3rdPartyLoginWithUsersWithMeld = function(testSequence, userToLogInWith3rdParty, usersToMeld, otherUsers){
        // The first user in list will be used to perform the pwd login
        var serviceName = _.keys(userToLogInWith3rdParty.services)[0];
        testSequence.push.apply(testSequence, [
            // At first, makes tests with askBeforeMeld = false
            resetAll,
            askBeforeMeld(false),
            insertUsers(usersToMeld),
            insertUsers(otherUsers),
            assertUsersCount(usersToMeld.length + otherUsers.length),
            registerService(serviceName, userToLogInWith3rdParty),
            start3rdPartyLogin(serviceName),
            login3rdParty,
            loggedInAs(userToLogInWith3rdParty),
            assertUsersCount(otherUsers.length + 1),
            assertUsersMissing(usersToMeld),
            logoutStep,
            unregisterService(serviceName),
            // Then, remakes same tests with askBeforeMeld = true
            resetAll,
            askBeforeMeld(true),
            insertUsers(usersToMeld),
            insertUsers(otherUsers),
            assertUsersCount(usersToMeld.length + otherUsers.length),
            registerService(serviceName, userToLogInWith3rdParty),
            start3rdPartyLogin(serviceName),
            login3rdParty,
            loggedInAs(userToLogInWith3rdParty),
            assertMeldActionsCount(usersToMeld.length),
            assertMeldActionsCorrect(userToLogInWith3rdParty, usersToMeld),
            logoutStep,
            unregisterService(serviceName),
        ]);
    };

    // A meld action is expected to be created here...
    testSequence = [];
    test3rdPartyLoginWithUsersWithMeld(testSequence,
        userFB1_V,
        [userLO1_V],
        [userFB1_nV, userFB2_nV, userFB2_V, userLO1_nV, userLO2_nV, userLO2_V]
    );
    test3rdPartyLoginWithUsersWithMeld(testSequence,
        userFB1_V,
        [userPwd1_V, userLO1_V],
        [userFB1_nV, userFB2_nV, userFB2_V, userLO1_nV, userLO2_nV, userLO2_V]
    );
    testSequence.push(resetAll);
    testAsyncMulti("accounts-meld - login with 3rd-party service and meld", testSequence);



    var testPwdLoginPlusAddServiceNoMeld = function(testSequence, users, userWithServiceToAdd){
        // The first user in list will be used to perform the login test
        var serviceName = _.keys(userWithServiceToAdd.services)[0];
        testSequence.push.apply(testSequence, [
            // At first, makes tests with askBeforeMeld = false
            resetAll,
            registerService(serviceName, userWithServiceToAdd),
            insertUsers(users),
            assertUsersCount(users.length),
            askBeforeMeld(false),
            pwdLogin(users[0]),
            loggedInAs(users[0]),
            start3rdPartyLogin(serviceName),
            login3rdPartyServiceAdded,
            loggedInAs(users[0]),
            assertUsersCount(users.length),
            logoutStep,
            unregisterService(serviceName),
            // Then, remakes same tests with askBeforeMeld = true
            resetAll,
            registerService(serviceName, userWithServiceToAdd),
            insertUsers(users),
            assertUsersCount(users.length),
            askBeforeMeld(true),
            pwdLogin(users[0]),
            loggedInAs(users[0]),
            start3rdPartyLogin(serviceName),
            login3rdPartyServiceAdded,
            loggedInAs(users[0]),
            assertUsersCount(users.length),
            assertMeldActionsCount(0),
            logoutStep,
            unregisterService(serviceName),
        ]);
    };
    // No meld action is expected to be created here...
    testSequence = [];
    testPwdLoginPlusAddServiceNoMeld(testSequence,
        [userPwd1_V, userFB2_nV, userFB2_V, userLO1_nV, userLO2_nV, userLO2_V],
        userFB1_V
    );
    testSequence.push(resetAll);
    testAsyncMulti("accounts-meld - already logged in with password plus add service (no meld)", testSequence);



    var testPwdLoginPlusAddServiceAndMeld = function(testSequence, users, userWithServiceToAdd){
        // The first user in list will be used to perform the login test
        var serviceName = _.keys(userWithServiceToAdd.services)[0];
        testSequence.push.apply(testSequence, [
            // At first, makes tests with askBeforeMeld = false
            resetAll,
            registerService(serviceName, userWithServiceToAdd),
            insertUsers(users),
            assertUsersCount(users.length),
            askBeforeMeld(false),
            pwdLogin(users[0]),
            loggedInAs(users[0]),
            start3rdPartyLogin(serviceName),
            login3rdPartyExistingServiceMelded,
            loggedInAs(users[0]),
            assertUsersCount(users.length - 1),
            assertUsersMissing(userWithServiceToAdd),
            logoutStep,
            unregisterService(serviceName),
            // Then, remakes same tests with askBeforeMeld = true
            resetAll,
            registerService(serviceName, userWithServiceToAdd),
            insertUsers(users),
            assertUsersCount(users.length),
            askBeforeMeld(true),
            pwdLogin(users[0]),
            loggedInAs(users[0]),
            start3rdPartyLogin(serviceName),
            login3rdPartyExistingServiceAdded,
            loggedInAs(users[0]),
            assertUsersCount(users.length),
            assertMeldActionsCount(1),
            assertMeldActionsCorrect(users[0], [userWithServiceToAdd]),
            logoutStep,
            unregisterService(serviceName),
        ]);
    };
    // No meld action is expected to be created here...
    testSequence = [];
    testPwdLoginPlusAddServiceAndMeld(testSequence,
        [userPwd1_V, userFB2_V, userLO1_nV, userLO2_nV, userLO2_V],
        userFB2_V
    );
    testSequence.push(resetAll);
    testAsyncMulti("accounts-meld - already logged in with password plus add service and meld", testSequence);



    var testServiceLoginPlusAddServiceNoMeld = function(testSequence, users, userWithServiceToAdd){
        // The first user in list will be used to perform the login test
        var serviceName1 = _.keys(users[0].services)[0];
        var serviceName2 = _.keys(userWithServiceToAdd.services)[0];
        testSequence.push.apply(testSequence, [
            // At first, makes tests with askBeforeMeld = false
            resetAll,
            registerService(serviceName1, users[0]),
            insertUsers(users),
            assertUsersCount(users.length),
            askBeforeMeld(false),
            start3rdPartyLogin(serviceName1),
            login3rdParty,
            loggedInAs(users[0]),
            unregisterService(serviceName1),
            registerService(serviceName2, userWithServiceToAdd),
            start3rdPartyLogin(serviceName2),
            login3rdPartyServiceAdded,
            loggedInAs(users[0]),
            assertUsersCount(users.length),
            logoutStep,
            unregisterService(serviceName2),
            // Then, remakes same tests with askBeforeMeld = true
            resetAll,
            registerService(serviceName1, users[0]),
            insertUsers(users),
            assertUsersCount(users.length),
            askBeforeMeld(true),
            start3rdPartyLogin(serviceName1),
            login3rdParty,
            loggedInAs(users[0]),
            unregisterService(serviceName1),
            registerService(serviceName2, userWithServiceToAdd),
            start3rdPartyLogin(serviceName2),
            login3rdPartyServiceAdded,
            loggedInAs(users[0]),
            assertUsersCount(users.length),
            assertMeldActionsCount(0),
            logoutStep,
            unregisterService(serviceName2),
        ]);
    };
    // No meld action is expected to be created here...
    testSequence = [];
    testServiceLoginPlusAddServiceNoMeld(testSequence,
        [userFB1_V, userFB2_nV, userFB2_V, userLO2_nV, userLO2_V],
        userLO1_nV
    );
    testSequence.push(resetAll);
    testAsyncMulti("accounts-meld - already logged in with service plus add service (no meld)", testSequence);



    var testServiceLoginPlusAddServiceAndMeld = function(testSequence, users, userWithServiceToAdd){
        // The first user in list will be used to perform the login test
        var serviceName1 = _.keys(users[0].services)[0];
        var serviceName2 = _.keys(userWithServiceToAdd.services)[0];
        testSequence.push.apply(testSequence, [
            // At first, makes tests with askBeforeMeld = false
            resetAll,
            registerService(serviceName1, users[0]),
            insertUsers(users),
            assertUsersCount(users.length),
            askBeforeMeld(false),
            start3rdPartyLogin(serviceName1),
            login3rdParty,
            loggedInAs(users[0]),
            unregisterService(serviceName1),
            registerService(serviceName2, userWithServiceToAdd),
            start3rdPartyLogin(serviceName2),
            login3rdPartyExistingServiceMelded,
            loggedInAs(users[0]),
            assertUsersCount(users.length - 1),
            assertUsersMissing(userWithServiceToAdd),
            logoutStep,
            unregisterService(serviceName2),
            // Then, remakes same tests with askBeforeMeld = true
            resetAll,
            registerService(serviceName1, users[0]),
            insertUsers(users),
            assertUsersCount(users.length),
            askBeforeMeld(true),
            start3rdPartyLogin(serviceName1),
            login3rdParty,
            loggedInAs(users[0]),
            unregisterService(serviceName1),
            registerService(serviceName2, userWithServiceToAdd),
            start3rdPartyLogin(serviceName2),
            login3rdPartyExistingServiceAdded,
            loggedInAs(users[0]),
            assertUsersCount(users.length),
            assertMeldActionsCount(1),
            assertMeldActionsCorrect(users[0], [userWithServiceToAdd]),
            logoutStep,
            unregisterService(serviceName2),
        ]);
    };
    // No meld action is expected to be created here...
    testSequence = [];
    testServiceLoginPlusAddServiceAndMeld(testSequence,
        [userFB1_V, userFB2_nV, userFB2_V, userLO1_nV, userLO2_nV],
        userLO1_nV
    );
    testSequence.push(resetAll);
    testAsyncMulti("accounts-meld - already logged in with service plus add service and meld", testSequence);
}