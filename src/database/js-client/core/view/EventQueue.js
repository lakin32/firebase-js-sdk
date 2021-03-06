/**
* Copyright 2017 Google Inc.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*   http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
goog.provide('fb.core.view.EventQueue');

/**
 * The event queue serves a few purposes:
 * 1. It ensures we maintain event order in the face of event callbacks doing operations that result in more
 *    events being queued.
 * 2. raiseQueuedEvents() handles being called reentrantly nicely.  That is, if in the course of raising events,
 *    raiseQueuedEvents() is called again, the "inner" call will pick up raising events where the "outer" call
 *    left off, ensuring that the events are still raised synchronously and in order.
 * 3. You can use raiseEventsAtPath and raiseEventsForChangedPath to ensure only relevant previously-queued
 *    events are raised synchronously.
 *
 * NOTE: This can all go away if/when we move to async events.
 *
 * @constructor
 */
fb.core.view.EventQueue = function() {
  /**
   * @private
   * @type {!Array.<fb.core.view.EventList>}
   */
  this.eventLists_ = [];

  /**
   * Tracks recursion depth of raiseQueuedEvents_, for debugging purposes.
   * @private
   * @type {!number}
   */
  this.recursionDepth_ = 0;
};

/**
 * @param {!Array.<fb.core.view.Event>} eventDataList The new events to queue.
 */
fb.core.view.EventQueue.prototype.queueEvents = function(eventDataList) {
  // We group events by path, storing them in a single EventList, to make it easier to skip over them quickly.
  var currList = null;
  for (var i = 0; i < eventDataList.length; i++) {
    var eventData = eventDataList[i];
    var eventPath = eventData.getPath();
    if (currList !== null && !eventPath.equals(currList.getPath())) {
      this.eventLists_.push(currList);
      currList = null;
    }

    if (currList === null) {
      currList = new fb.core.view.EventList(eventPath);
    }

    currList.add(eventData);
  }
  if (currList) {
    this.eventLists_.push(currList);
  }
};

/**
 * Queues the specified events and synchronously raises all events (including previously queued ones)
 * for the specified path.
 *
 * It is assumed that the new events are all for the specified path.
 *
 * @param {!fb.core.util.Path} path The path to raise events for.
 * @param {!Array.<fb.core.view.Event>} eventDataList The new events to raise.
 */
fb.core.view.EventQueue.prototype.raiseEventsAtPath = function(path, eventDataList) {
  this.queueEvents(eventDataList);

  this.raiseQueuedEventsMatchingPredicate_(function(eventPath) {
    return eventPath.equals(path);
  });
};

/**
 * Queues the specified events and synchronously raises all events (including previously queued ones) for
 * locations related to the specified change path (i.e. all ancestors and descendants).
 *
 * It is assumed that the new events are all related (ancestor or descendant) to the specified path.
 *
 * @param {!fb.core.util.Path} changedPath The path to raise events for.
 * @param {!Array.<!fb.core.view.Event>} eventDataList The events to raise
 */
fb.core.view.EventQueue.prototype.raiseEventsForChangedPath = function(changedPath, eventDataList) {
  this.queueEvents(eventDataList);

  this.raiseQueuedEventsMatchingPredicate_(function(eventPath) {
    return eventPath.contains(changedPath) || changedPath.contains(eventPath);
  });
};

/**
 * @param {!function(!fb.core.util.Path):boolean} predicate
 * @private
 */
fb.core.view.EventQueue.prototype.raiseQueuedEventsMatchingPredicate_ = function(predicate) {
  this.recursionDepth_++;

  var sentAll = true;
  for (var i = 0; i < this.eventLists_.length; i++) {
    var eventList = this.eventLists_[i];
    if (eventList) {
      var eventPath = eventList.getPath();
      if (predicate(eventPath)) {
        this.eventLists_[i].raise();
        this.eventLists_[i] = null;
      } else {
        sentAll = false;
      }
    }
  }

  if (sentAll) {
    this.eventLists_ = [];
  }

  this.recursionDepth_--;
};


/**
 * @param {!fb.core.util.Path} path
 * @constructor
 */
fb.core.view.EventList = function(path) {
  /**
   * @const
   * @type {!fb.core.util.Path}
   * @private
   */
  this.path_ = path;
  /**
   * @type {!Array.<fb.core.view.Event>}
   * @private
   */
  this.events_ = [];
};

/**
 * @param {!fb.core.view.Event} eventData
 */
fb.core.view.EventList.prototype.add = function(eventData) {
  this.events_.push(eventData);
};

/**
 * Iterates through the list and raises each event
 */
fb.core.view.EventList.prototype.raise = function() {
  for (var i = 0; i < this.events_.length; i++) {
    var eventData = this.events_[i];
    if (eventData !== null) {
      this.events_[i] = null;
      var eventFn = eventData.getEventRunner();
      if (fb.core.util.logger) {
        fb.core.util.log('event: ' + eventData.toString());
      }
      fb.core.util.exceptionGuard(eventFn);
    }
  }
};

/**
 * @return {!fb.core.util.Path}
 */
fb.core.view.EventList.prototype.getPath = function() {
  return this.path_;
};

