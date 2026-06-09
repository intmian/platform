import assert from 'node:assert/strict';
import {shouldShowMemosHistoryHover} from './memosHistoryHover.js';

assert.equal(shouldShowMemosHistoryHover({isMobile: true, popoverOpen: false}), false);
assert.equal(shouldShowMemosHistoryHover({isMobile: true, popoverOpen: true}), false);
assert.equal(shouldShowMemosHistoryHover({isMobile: false, popoverOpen: false}), true);
assert.equal(shouldShowMemosHistoryHover({isMobile: false, popoverOpen: true}), false);
