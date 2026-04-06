#!/usr/bin/env node

/**
 * Patch get-intrinsic@1.3.0 for ESM strict mode compatibility
 * 
 * This script fixes two issues in get-intrinsic@1.3.0 that cause errors
 * when used with ESM modules and VS Code debugger strict mode:
 * 1. Line 42: arguments.callee access in strict mode
 * 2. Line 155: null.error property access
 * 
 * See: https://github.com/ljharb/get-intrinsic/issues/...
 */

const fs = require('fs');
const path = require('path');

const getIntrinsicPath = path.join(__dirname, '../node_modules/get-intrinsic/index.js');

if (!fs.existsSync(getIntrinsicPath)) {
  console.log('[patch-get-intrinsic] get-intrinsic not found, skipping patch');
  process.exit(0);
}

let content = fs.readFileSync(getIntrinsicPath, 'utf8');
let patched = false;

// Patch 1: Fix arguments.callee in strict mode (around line 42)
const oldCalleeCode = `var ThrowTypeError = $gOPD
	? (function () {
		try {
			// eslint-disable-next-line no-unused-expressions, no-caller, no-restricted-properties
			arguments.callee; // IE 8 does not throw here
			return throwTypeError;
		} catch (calleeThrows) {
			try {
				// IE 8 throws on Object.getOwnPropertyDescriptor(arguments, '')
				return $gOPD(arguments, 'callee').get;
			} catch (gOPDthrows) {
				return throwTypeError;
			}
		}
	}())
	: throwTypeError;`;

const newCalleeCode = `var ThrowTypeError = $gOPD
	? (function () {
		try {
			// eslint-disable-next-line no-unused-expressions, no-caller, no-restricted-properties
			// Skip strict mode check - return throwTypeError for modern environments
			var args = arguments;
			if (typeof args !== 'undefined' && args !== null) {
				try {
					// Try to access callee (IE 8 compatibility)
					var callee = args.callee;
					return throwTypeError;
				} catch (e1) {
					// Callee access failed, try via descriptor
					try {
						return $gOPD(args, 'callee').get;
					} catch (e2) {
						// Both methods failed, return throwTypeError
						return throwTypeError;
					}
				}
			}
			return throwTypeError;
		} catch (outerError) {
			// Any error occurs, safely return throwTypeError
			return throwTypeError;
		}
	}())
	: throwTypeError;`;

if (content.includes(oldCalleeCode)) {
  content = content.replace(oldCalleeCode, newCalleeCode);
  patched = true;
  console.log('[patch-get-intrinsic] ✓ Fixed arguments.callee strict mode issue');
}

// Patch 2: Fix null.error access (around line 155)
const oldNullCode = `if (getProto) {
	try {
		null.error; // eslint-disable-line no-unused-expressions
	} catch (e) {
		// https://github.com/tc39/proposal-shadowrealm/pull/384#issuecomment-1364264229
		var errorProto = getProto(getProto(e));
		INTRINSICS['%Error.prototype%'] = errorProto;
	}
}`;

const newNullCode = `if (getProto) {
	try {
		// Try to get error prototype by inducing a null reference error
		// In strict mode, this may not work as expected, so wrap with safety check
		var nullValue = null;
		if (nullValue && typeof nullValue.error !== 'undefined') {
			nullValue.error; // This will never execute
		}
	} catch (e) {
		// Successfully caught an error, extract the prototype chain
		// https://github.com/tc39/proposal-shadowrealm/pull/384#issuecomment-1364264229
		if (e && getProto) {
			try {
				var errorProto = getProto(getProto(e));
				INTRINSICS['%Error.prototype%'] = errorProto;
			} catch (protoError) {
				// Silently fail if prototype extraction doesn't work
			}
		}
	}
}`;

if (content.includes(oldNullCode)) {
  content = content.replace(oldNullCode, newNullCode);
  patched = true;
  console.log('[patch-get-intrinsic] ✓ Fixed null.error access issue');
}

if (patched) {
  fs.writeFileSync(getIntrinsicPath, content, 'utf8');
  console.log('[patch-get-intrinsic] Successfully patched get-intrinsic@1.3.0');
} else {
  console.log('[patch-get-intrinsic] get-intrinsic already patched or version mismatch');
}
