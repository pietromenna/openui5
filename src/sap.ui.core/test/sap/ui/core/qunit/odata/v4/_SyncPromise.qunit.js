/*!
 * ${copyright}
 */
sap.ui.require([
	"jquery.sap.global",
	"sap/ui/model/odata/v4/_SyncPromise",
	"sap/ui/test/TestUtils"
], function (jQuery, _SyncPromise, TestUtils) {
	/*global QUnit, sinon */
	/*eslint max-nested-callbacks:[1,5], no-warning-comments: 0 */
	"use strict";

	function assertFulfilled(assert, oSyncPromise, vExpectedResult) {
		assert.strictEqual(oSyncPromise.isFulfilled(), true);
		assert.strictEqual(oSyncPromise.isRejected(), false);
		if (Array.isArray(vExpectedResult)) {
			assert.deepEqual(oSyncPromise.getResult(), vExpectedResult);
		} else {
			assert.strictEqual(oSyncPromise.getResult(), vExpectedResult);
		}
	}

	function assertPending(assert, oSyncPromise) {
		assert.strictEqual(oSyncPromise.isFulfilled(), false);
		assert.strictEqual(oSyncPromise.isRejected(), false);
		assert.strictEqual(oSyncPromise.getResult(), oSyncPromise);
	}

	function assertRejected(assert, oSyncPromise, vExpectedReason) {
		assert.strictEqual(oSyncPromise.isFulfilled(), false);
		assert.strictEqual(oSyncPromise.isRejected(), true);
		assert.strictEqual(oSyncPromise.getResult(), vExpectedReason);
	}

	//*********************************************************************************************
	QUnit.module("sap.ui.model.odata.v4._SyncPromise", {
		beforeEach : function () {
			this.oSandbox = sinon.sandbox.create();
			this.oLogMock = this.oSandbox.mock(jQuery.sap.log);
			this.oLogMock.expects("warning").never();
			this.oLogMock.expects("error").never();
		},

		afterEach : function () {
			this.oSandbox.verifyAndRestore();
		}
	});

	//*********************************************************************************************
	[42, undefined, {then : 42}, {then : function () {}}, [_SyncPromise.resolve()]
	].forEach(function (vResult) {
		QUnit.test("_SyncPromise.resolve with non-Promise value: " + vResult, function (assert) {
			assertFulfilled(assert, _SyncPromise.resolve(vResult), vResult);
		});
	});

	//*********************************************************************************************
	QUnit.test("access to state and result: fulfills", function (assert) {
		var done = assert.async(),
			oNewPromise,
			oPromise = Promise.resolve(42),
			oSyncPromise;

		oSyncPromise = _SyncPromise.resolve(oPromise);

		assertPending(assert, oSyncPromise);

		assert.strictEqual(_SyncPromise.resolve(oSyncPromise), oSyncPromise,
			"resolve() does not wrap a _SyncPromise again");

		oNewPromise = oSyncPromise.then(function (iResult) {
			assertFulfilled(assert, oSyncPromise, iResult);
			done(); // test completes once returned promise is settled AND done is called
		});

		assertPending(assert, oNewPromise);

		return oPromise.then(function (iResult) {
			// _SyncPromise fulfills as soon as Promise fulfills
			assertFulfilled(assert, oSyncPromise, iResult);
		});
	});

	//*********************************************************************************************
	QUnit.test("'then' on a fulfilled _SyncPromise", function (assert) {
		var bCalled = false,
			oNewSyncPromise,
			oSyncPromise = _SyncPromise.resolve(42);

		oNewSyncPromise = oSyncPromise
			.then(/* then w/o fnOnFulfilled does not change result */)
			.then("If onFulfilled is not a function, it must be ignored")
			.then(undefined, function () {
				assert.ok(false, "unexpected call to reject callback");
			})
			.then(function (iResult) {
				assertFulfilled(assert, oSyncPromise, iResult);
				assert.strictEqual(bCalled, false, "then called exactly once");
				bCalled = true;
				return "*" + iResult + "*";
			});

		assertFulfilled(assert, oNewSyncPromise, "*42*");
		assert.strictEqual(bCalled, true, "called synchronously");

		oNewSyncPromise.then(function (sResult) {
			assert.strictEqual(sResult, oNewSyncPromise.getResult(), "*42*");
		});
	});

	//*********************************************************************************************
	[
		{wrap : false, reject : false},
		{wrap : true, reject : false},
		{wrap : false, reject : true},
		{wrap : true, reject : true}
	].forEach(function (oFixture) {
		QUnit.test("sync -> async: " + JSON.stringify(oFixture), function (assert) {
			var done = assert.async(),
				oPromise = oFixture.reject ? Promise.reject() : Promise.resolve(),
				oSyncPromise = _SyncPromise.resolve(oPromise);

			return oPromise[oFixture.reject ? "catch" : "then"](function () {
				var oFulfillment = {},
					oNewSyncPromise,
					oResult = new Promise(function (resolve, reject) {
						setTimeout(function () {
							assertPending(assert, oNewSyncPromise); // not yet
						}, 0);
						setTimeout(function () {
							resolve(oFulfillment);
						}, 10);
					});

				function callback() {
					return oResult; // returning a promise makes us async again
				}

				function fail() {
					assert.ok(false, "unexpected call");
				}

				if (oFixture.wrap) {
					oResult = _SyncPromise.resolve(oResult);
				}

				// 'then' on a settled _SyncPromise is called synchronously
				oNewSyncPromise = oFixture.reject
					? oSyncPromise.then(fail, callback)
					: oSyncPromise.then(callback, fail);

				assert.notStrictEqual(oNewSyncPromise, oResult, "'then' returns a new promise");

				oNewSyncPromise.then(function (vResult) {
					assertFulfilled(assert, oNewSyncPromise, oFulfillment);
					assert.strictEqual(vResult, oFulfillment);
					done();
				});
			});
		});
	});

	//*********************************************************************************************
	[
		{initialReject : false, thenReject : false},
		{initialReject : false, thenReject : true},
		{initialReject : true, thenReject : false},
		{initialReject : true, thenReject : true}
	].forEach(function (oFixture) {
		QUnit.test("sync -> sync: " + JSON.stringify(oFixture), function (assert) {
			var oResult = {},
				oInitialPromise = oFixture.initialReject ? Promise.reject() : Promise.resolve(),
				oInitialSyncPromise = _SyncPromise.resolve(oInitialPromise),
				sMethod = oFixture.initialReject || oFixture.thenReject ? "catch" : "then",
				oThenPromise = oFixture.thenReject
					? Promise.reject(oResult)
					: Promise.resolve(oResult),
				oThenSyncPromise = _SyncPromise.resolve(oThenPromise);

			return Promise.all([oInitialPromise, oThenPromise])[sMethod](function () {
				// 'then' on a settled _SyncPromise is called synchronously
				var oNewSyncPromise = oFixture.initialReject
					? oInitialSyncPromise.then(fail, callback)
					: oInitialSyncPromise.then(callback, fail);

				function callback() {
					// returning a settled _SyncPromise keeps us sync
					return oThenSyncPromise;
				}

				function fail() {
					assert.ok(false, "unexpected call");
				}

				if (oFixture.thenReject) {
					assertRejected(assert, oNewSyncPromise, oResult);
				} else {
					assertFulfilled(assert, oNewSyncPromise, oResult);
				}
			});
		});
	});

	//*********************************************************************************************
	QUnit.test("sync -> sync: throws", function (assert) {
		var oError = new Error(),
			oInitialSyncPromise = _SyncPromise.resolve(),
		// 'then' on a settled _SyncPromise is called synchronously
			oNewSyncPromise = oInitialSyncPromise.then(callback, fail);

		function callback() {
			throw oError;
		}

		function fail() {
			assert.ok(false, "unexpected call");
		}

		assertRejected(assert, oNewSyncPromise, oError);
	});

	//*********************************************************************************************
	QUnit.test("access to state and result: rejects", function (assert) {
		var done = assert.async(),
			oNewPromise,
			oReason = {},
			oPromise = Promise.reject(oReason),
			oSyncPromise;

		oSyncPromise = _SyncPromise.resolve(oPromise);

		assertPending(assert, oSyncPromise);

		oNewPromise = oSyncPromise.then(function () {
			assert.ok(false);
			done();
		}, function (vReason) {
			assert.strictEqual(vReason, oReason);
			done();
		});

		assertPending(assert, oNewPromise);

		return oPromise.catch(function () {
			assertRejected(assert, oSyncPromise, oReason);
		});
	});

	//*********************************************************************************************
	QUnit.test("'then' on a rejected _SyncPromise", function (assert) {
		var oReason = {},
			oPromise = Promise.reject(oReason),
			oSyncPromise = _SyncPromise.resolve(oPromise);

		return oPromise.catch(function () {
			var bCalled = false,
				oNewSyncPromise;

			oNewSyncPromise = oSyncPromise
				.then(/* then w/o callbacks does not change result */)
				.then(null, "If onRejected is not a function, it must be ignored")
				.then(function () {
					assert.ok(false);
				}, function (vReason) {
					assertRejected(assert, oSyncPromise, oReason);
					assert.strictEqual(vReason, oReason);
					assert.strictEqual(bCalled, false, "then called exactly once");
					bCalled = true;
					return "OK";
				});

			assertFulfilled(assert, oNewSyncPromise, "OK");
			assert.strictEqual(bCalled, true, "called synchronously");

			oNewSyncPromise.then(function (sResult) {
				assert.strictEqual(sResult, oNewSyncPromise.getResult(), "OK");
			});
		});
	});

	//*********************************************************************************************
	QUnit.test("_SyncPromise.all: simple values", function (assert) {
		assertFulfilled(assert, _SyncPromise.all([]), []);
		assertFulfilled(assert, _SyncPromise.all([42]), [42]);
		assertFulfilled(assert, _SyncPromise.all([_SyncPromise.resolve(42)]), [42]);
	});

	//*********************************************************************************************
	[true, false].forEach(function (bWrap) {
		QUnit.test("_SyncPromise.all: one Promise resolves, wrap = " + bWrap, function (assert) {
			var oPromise = Promise.resolve(42),
				oPromiseAll;

			if (bWrap) {
				oPromise = _SyncPromise.resolve(oPromise);
			}

			oPromiseAll = _SyncPromise.all([oPromise]);

			assertPending(assert, oPromiseAll);
			return oPromise.then(function () {
				assertFulfilled(assert, oPromiseAll, [42]);
			});
		});
	});

	//*********************************************************************************************
	QUnit.test("_SyncPromise.all: two Promises resolve", function (assert) {
		var oPromiseAll,
			oPromise0 = Promise.resolve(42), // timeout 0
			oPromise1 = new Promise(function (resolve, reject) {
				setTimeout(function () {
					assertPending(assert, oPromiseAll); // not yet
				}, 5);
				setTimeout(function () {
					resolve("OK");
				}, 10);
			}),
			aPromises = [oPromise0, oPromise1];

		oPromiseAll = _SyncPromise.all(aPromises);

		assertPending(assert, oPromiseAll);
		return Promise.all(aPromises).then(function () {
			assertFulfilled(assert, oPromiseAll, [42, "OK"]);
			assert.deepEqual(aPromises, [oPromise0, oPromise1], "caller's array unchanged");
		});
	});

	//*********************************************************************************************
	QUnit.test("_SyncPromise.all: one Promise rejects", function (assert) {
		var oReason = {},
			oPromise = Promise.reject(oReason),
			oPromiseAll;

		oPromiseAll = _SyncPromise.all([oPromise]);

		assertPending(assert, oPromiseAll);
		return oPromise.catch(function () {
			assertRejected(assert, oPromiseAll, oReason);
		});
	});

	//*********************************************************************************************
	QUnit.test("_SyncPromise.all: two Promises reject", function (assert) {
		var oReason = {},
			oPromiseAll,
			oPromise0 = Promise.reject(oReason), // timeout 0
			oPromise1 = new Promise(function (resolve, reject) {
				setTimeout(function () {
					assertRejected(assert, oPromiseAll, oReason);
				}, 5);
				setTimeout(function () {
					reject("Unexpected");
				}, 10);
			}),
			aPromises = [oPromise0, oPromise1];

		oPromiseAll = _SyncPromise.all(aPromises);

		assertPending(assert, oPromiseAll);
		return oPromise1.catch(function () { // wait for the "slower" promise
			assertRejected(assert, oPromiseAll, oReason); // rejection reason does not change
			assert.deepEqual(aPromises, [oPromise0, oPromise1], "caller's array unchanged");
		});
	});

	//*********************************************************************************************
	QUnit.test("'catch' delegates to 'then'", function (assert) {
		var oNewPromise = {},
			fnOnRejected = function () {},
			oSyncPromise = _SyncPromise.resolve();

		this.oSandbox.mock(oSyncPromise).expects("then")
			.withExactArgs(undefined, fnOnRejected)
			.returns(oNewPromise);

		assert.strictEqual(oSyncPromise.catch(fnOnRejected), oNewPromise);
	});

	//*********************************************************************************************
	QUnit.test("Promise.resolve on _SyncPromise", function (assert) {
		return Promise.resolve(_SyncPromise.resolve(42)).then(function (iResult) {
			assert.strictEqual(iResult, 42);
		});
	});

	//*********************************************************************************************
	QUnit.test("createGetMethod, not throwing", function (assert) {
		var aArguments = ["foo", "bar"],
			oResult = {},
			oSyncPromise = _SyncPromise.resolve(oResult),
			oContext = {
				fetch : function () {
					assert.strictEqual(this, oContext);
					assert.deepEqual(Array.prototype.slice.call(arguments), aArguments);
					return oSyncPromise;
				}
			},
			fnGet;

		// code under test
		// Note: passing the function's name instead of reference allows for dynamic dispatch, thus
		// making a mock for "fetch*" possible in the first place
		fnGet = _SyncPromise.createGetMethod("fetch");

		assert.strictEqual(fnGet.apply(oContext, aArguments), oResult);
		this.oSandbox.mock(oSyncPromise).expects("isFulfilled").returns(false);
		assert.strictEqual(fnGet.apply(oContext, aArguments), undefined);
	});

	//*********************************************************************************************
	QUnit.test("createGetMethod, throwing", function (assert) {
		var aArguments = ["foo", "bar"],
			oResult = {},
			oSyncPromise = _SyncPromise.resolve(oResult),
			oContext = {
				fetch : function () {
					assert.strictEqual(this, oContext);
					assert.deepEqual(Array.prototype.slice.call(arguments), aArguments);
					return oSyncPromise;
				}
			},
			fnGet,
			oSyncPromiseMock = this.oSandbox.mock(oSyncPromise);

		// code under test
		fnGet = _SyncPromise.createGetMethod("fetch", true);

		// fulfilled
		assert.strictEqual(fnGet.apply(oContext, aArguments), oResult);

		// pending
		oSyncPromiseMock.expects("isFulfilled").returns(false);
		oSyncPromiseMock.expects("isRejected").returns(false);
		assert.throws(function () {
			fnGet.apply(oContext, aArguments);
		}, new Error("Result pending"));

		// verify and restore
		oSyncPromiseMock.verify();
		oSyncPromiseMock = this.oSandbox.mock(oSyncPromise);

		// rejected
		oSyncPromiseMock.expects("isFulfilled").returns(false);
		oSyncPromiseMock.expects("isRejected").returns(true);
		assert.throws(function () {
			fnGet.apply(oContext, aArguments);
		}, oResult);
	});

	//*********************************************************************************************
	QUnit.test("createRequestMethod", function (assert) {
		var aArguments = ["foo", "bar"],
			oResult = {},
			oSyncPromise = _SyncPromise.resolve(),
			oContext = {
				fetch : function () {
					assert.strictEqual(this, oContext);
					assert.deepEqual(Array.prototype.slice.call(arguments), aArguments);
					return oSyncPromise;
				}
			},
			fnRequest;

		this.oSandbox.mock(Promise).expects("resolve").withExactArgs(oSyncPromise).returns(oResult);

		// code under test
		fnRequest = _SyncPromise.createRequestMethod("fetch");

		assert.strictEqual(fnRequest.apply(oContext, aArguments), oResult);
	});
});
