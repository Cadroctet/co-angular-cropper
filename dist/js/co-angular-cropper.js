(function (angular, undefined) {
    'use strict';

    // ---------- CROPPABLE GLOBAL MODULE ---------- //
    var croppable = angular.module('co-angular-cropper', []);

    // ---------- GLOBAL HELPER FUNCTIONS ---------- //

    // Uppercase the first letter of a string
    String.prototype.ucfirst = function () {
        return this.charAt(0).toUpperCase() + this.slice(1);
    };
    // Lowercase the first letter of string
    String.prototype.lcfirst = function () {
        return this.charAt(0).toLowerCase() + this.slice(1);
    };
    // Checks if an element is in an array/object
    function contains(a, obj) {
        var i = a.length;
        while (i--) {
            if (a[i] === obj) {
                return true;
            }
        }
        return false;
    }

    // ---------- CROPPABLE DIRECTIVE GLOBAL OPTIONS ---------- //
    croppable.constant('CroppableDefaults', {
        aspectRatio: 0,
        ruleOfThirds: true,
        outputType: 'base64',
        widthMin: 50,
        widthMax: 0,
        heightMin: 50,
        heightMax: 0,
        autoCropping: true,
        imageType: 'jpeg',
        centerHandles: true,
        sizeHint: true,
        loadingClass: 'cropper-loading',
        backdropOpacity: 50,
        eventPrefix: 'crop',
        optionsPrefix: 'crop',
        directiveName: '$croppable',
        preloader: true
    });

    // ---------- CROPPABLE DIRECTIVE CONTROLLER ---------- //
    croppable.controller('CroppableController', ['$scope', '$element', '$attrs', '$compile', '$parse', '$q', '$log', '$window', '$document', '$timeout', '$interpolate', 'CroppableDefaults', function ($scope, $element, $attrs, $compile, $parse, $q, $log, $window, $document, $timeout, $interpolate, CroppableDefaults) {
        // ---------------- INITIALIZE GLOBALS ---------------- //
        var self = this;
        // Coordinates of the drag start position.
        var startCoords;
        // Coordinates of pointer while dragging
        var currCoords;
        // Min/Max values of the movable area
        var moveBoundaries = {};
        // Isolated Scope for the cropping UI
        var UIScope = $scope.$new(true);
        // Let's the user resize the selection vertically, horizontally or both depending on which one is truthy
        var resizeH = true, resizeV = true;
        // The directives options
        var globalOptions;
        // If the croppper has already being initialized
        var initialized = false;
        // This flag indicates if the source image is currently being changed
        var changingSrc = false;
        // A list of created watches
        var watchList = [];
        // The watcher for the data model, it will store the unbinding function
        var modelWatcher;
        // The watcher for the options object, it will store the unbinding function
        var optionsWatcher;
        // The observer for the image source, it will store the unbinding function
        var sourceObserver;
        // A list of available callbacks
        var validCallbacks = ['onSelectStart', 'onSelect', 'onSelectEnd', 'onMoveStart', 'onMove', 'onMoveEnd', 'onEnable', 'onDisable', 'onReset', 'onUpdate', 'onDestroy', 'onReady', 'beforeImageLoad', 'onImageLoad'];
        // Name used to register the instance in the scope
        self.$name; // = $attrs[globalOptions.optionsPrefix + 'Name'] ? $interpolate($attrs[globalOptions.optionsPrefix + 'Name'])($scope) : undefined;
        // Whether user is selecting an area.
        self.$selecting = false;
        // Whether user is moving the selected area
        self.$moving = false;
        // If the cropper is loading an image
        self.$loading = false;
        // The crop area measurements
        self.$measurements = {top: 0, left: 0, width: 0, height: 0};
        // Data relative to the image size
        self.$data = {top: 0, left: 0, width: 0, height: 0, base64: null};
        // Source image information - object containing, originalWidth, originalHeight, scaleRatio, scaledWidth, scaledHeight
        self.$imgInfo = {};
        // If the cropper is active
        self.$active = false;
        // A flag that keep track if there is something selected
        self.$hasSelection = false;
        // Inidicates if the crop interface, event and listeners have been created
        self.$initialized = false;
        // Handlers to the different elements
        self.$cropContainer;
        self.$cropper;
        self.$cropArea;
        self.$overlayedImg;
        self.$cropHandles;
        self.$centerHandles;
        self.$sizeHint;
        self.$ruleOfThirds;

        // ------------ UI BUILDING AND UPDATING --------------//

        // Main control for updating the cropping interface
        function updateInterface(action) {
            if (angular.isDefined(self.$cropper)) {
                makeTrueMeasurements();
                validateMeasurements();
                makeCropData();
                self.$hasSelection = selectionExists();
                runCallback(action);
                updateSelection();
                updateCropHandles();
                runCallback('onUpdate');
            }
            return self;
        }

        // Building the cropping UI elements, it returns the UI as a DOM element
        // it works like a template with an isolated scope
        function buildInterface() {
            // Set the source of the overlay image
            UIScope.imgSrc = $attrs.ngSrc;
            // Wrap the element in a div container
            $element.wrap('<div class="crop-it-container"></div>');
            // Prepend the cropping UI
            self.$cropContainer = $element.parent().prepend(compileUI());
            // Save handlers for easy access
            self.$cropper = angular.element(self.$cropContainer[0].querySelector('.cropper'));
            self.$cropArea = angular.element(self.$cropper[0].querySelector('.crop-area'));
            self.$overlayedImg = angular.element(self.$cropArea[0].querySelector('img'));
            self.$cropHandles = angular.element(self.$cropper[0].querySelector('.crop-handles'));
            self.$centerHandles = angular.element(self.$cropHandles[0].querySelectorAll('.center-handle'));
            self.$sizeHint = angular.element(self.$cropper[0].querySelector('.size-hint'));
            self.$ruleOfThirds = angular.element(self.$cropArea[0].querySelectorAll('.rule-of-thirds'));
        }

        // Compiles the croppers UI HTML
        function compileUI() {
            var UI = '';

            UI += '<span ng-if="options.preloader" class="crop-loader"><span class="crop-loader-inner"></span></span>';
            UI += '<div class="cropper" style="display: none;">';
            UI += '<div class="crop-area">';
            UI += '<img ng-src="{{ imgSrc }}">';
            UI += '<span class="rule-of-thirds vertical-1"></span>';
            UI += '<span class="rule-of-thirds vertical-2"></span>';
            UI += '<span class="rule-of-thirds horizontal-1"></span>';
            UI += '<span class="rule-of-thirds horizontal-2"></span>';
            UI += '</div>';
            UI += '<div class="crop-handles">';
            UI += '<div class="handle top-left"></div>';
            UI += '<div class="handle center-handle top"></div>';
            UI += '<div class="handle top-right"></div>';
            UI += '<div class="handle center-handle right"></div>';
            UI += '<div class="handle bottom-right"></div>';
            UI += '<div class="handle center-handle bottom"></div>';
            UI += '<div class="handle bottom-left"></div>';
            UI += '<div class="handle center-handle left"></div>';
            UI += '</div>';
            UI += '<span class="size-hint"></span>';
            UI += '</div>'

            UI = angular.element(UI);
            UIScope.options = globalOptions;
            return $compile(UI)(UIScope);
        }

        // Update the selection area, width, height, top and left positioning
        function updateSelection() {
            // Update the crop area position and visibility
            self.$cropper.css({
                display: self.$active && self.$hasSelection ? 'block' : 'none',
                top: self.$measurements.top + 'px',
                left: self.$measurements.left + 'px',
                width: self.$measurements.width + 'px',
                height: self.$measurements.height + 'px'
            });
            // Update the position of the overlayed image to keep it align with original
            self.$overlayedImg.css({
                width: $element[0].offsetWidth + 'px',
                height: $element[0].offsetHeight + 'px',
                top: '-' + self.$measurements.top + 'px',
                left: '-' + self.$measurements.left + 'px'
            });
            // Update the opacity of the source image
            $element.css({
                opacity: self.$active && self.$hasSelection ? globalOptions.backdropOpacity / 100 : '1'
            });
            // Update the measurements in the size hint
            self.$sizeHint.text(Math.round(self.$data.width) + 'x' + Math.round(self.$data.height)).css({
                opacity: globalOptions.sizeHint && self.$selecting && self.$hasSelection ? 1 : 0
            });
            // Update the rule of thirds grid
            self.$ruleOfThirds.css({
                display: globalOptions.ruleOfThirds && self.$hasSelection ? 'block' : 'none'
            });
        }

        // Updates the position and visibility of the crop handles
        function updateCropHandles() {
            self.$cropHandles.css({
                display: self.$hasSelection && (!self.$selecting && !self.$moving) && self.$active ? 'block' : 'none'
            });
            self.$centerHandles.css({
                display: globalOptions.centerHandles ? 'block' : 'none'
            });
        }

        // Removes the UI from the DOM
        function removeUI(event) {
            // Remove the listener
            $element.off('$destroy', removeUI);
            // If th eimage element is being removed froom the DOM then remove instance from scope if set
            if (angular.isDefined(event) && angular.isDefined(self.$name)) {
                delete $parse(globalOptions.directiveName)($scope)[self.$name];
            }
            if (angular.isDefined(self.$cropContainer)) {
                // Make a temporary disable of crop
                disableCrop(true);
                // If the ngSrc is undefined, we need to manually remove the src and set back the original ngSrc
                // because undefined attributes don't get copied over with the replaceWith method, so we set it
                // manually to not loose the ngSrc binding, this is only done with manual destruction
                if (angular.isUndefined($attrs.ngSrc) && angular.isUndefined(event)) {
                    $element.removeAttr('src');
                    $element.attr('ng-src', self.$srcAttr)
                }
                // Remove the crop UI
                self.$cropContainer.replaceWith($element);
                // Reset DOM handlers
                self.$cropContainer = undefined;
                self.$cropper = undefined;
                self.$cropArea = undefined;
                self.$cropHandles = undefined;
                self.$overlayedImg = undefined;
                self.$centerHandles = undefined;
                self.$sizeHint = undefined;
                self.$ruleOfThirds = undefined;
            }
            // Remove the watchers
            angular.forEach(watchList, function (watcher) {
                watcher();
            });
            // Stop watching the data model
            unwatchModel();
            // Stop watching the options model
            unwatchOptions();
            // If removing UI in a image source change don't remove the observer
            if (!changingSrc) {
                unobserveSource();
                // Change initialized flag
                initialized = self.$initialized = false;
            }
            // self.$data = { width: 0, height: 0, top: 0, left: 0, base64: null };
            self.$data.base64 = null;
            runCallback('onDestroy');
        }

        // ------------- WATCHERS AND OBSERVERS -------------- //

        function watchModel() {
            modelWatcher = $scope.$watch($attrs.croppable, function (newVal, oldVal) {
                if (newVal !== oldVal && angular.isDefined(newVal) && !changingSrc) {
                    if (angular.isObject(newVal)) {
                        if (newVal.width && oldVal.width && newVal.width !== oldVal.width) {
                            resizeH = true;
                        }
                        else if (newVal.height && oldVal.height && newVal.height !== oldVal.height) {
                            resizeV = true;
                        }
                        self.$data.top = newVal.top || self.$data.top;
                        self.$data.left = newVal.left || self.$data.left;
                        self.$data.width = newVal.width || self.$data.width;
                        self.$data.height = newVal.height || self.$data.height;
                        makeMeasurements();
                        updateInterface();
                        resizeH = false;
                        resizeV = false;
                    }
                    else {
                        $log.warn('The new value in the ' + ($attrs.croppable + ' variable ' || 'croppable attribute ') + 'is not an object!');
                    }
                }
            }, true);
        }

        function unwatchModel() {
            if (angular.isUndefined(modelWatcher)) {
                return false;
            }
            modelWatcher();
            modelWatcher = undefined;
            return true;
        }

        function watchOptions() {
            optionsWatcher = $scope.$watch($attrs[globalOptions.optionsPrefix + 'Options'], function (newVal, oldVal) {
                if (newVal !== oldVal && angular.isDefined(newVal)) {
                    options(newVal);
                }
                else if (newVal !== oldVal && angular.isUndefined(newVal)) {
                    options(CroppableDefaults);
                }
            }, true);
        }

        function unwatchOptions() {
            if (angular.isUndefined(optionsWatcher)) {
                return false;
            }
            optionsWatcher();
            optionsWatcher = undefined;
            return true;
        }

        // Generates the watchers so that they can be deregistered on destroy
        function startWatching() {
            // Watch if the croppable attribute object changes
            watchModel();
            // Watch if the cropShow attribute changes
            if ($attrs.hasOwnProperty(globalOptions.optionsPrefix + 'Show')) {
                addWatch($attrs[globalOptions.optionsPrefix + 'Show'], function (newVal, oldVal) {
                    if (newVal !== oldVal && typeof newVal === 'boolean' && newVal !== oldVal && !changingSrc) {
                        if (newVal === false) {
                            disableCrop();
                        }
                        else {
                            enableCrop();
                        }
                    }
                });
            }
            // Watch if the options object changes and is defined in the attributes
            if ($attrs.hasOwnProperty(globalOptions.optionsPrefix + 'Options')) {
                watchOptions();
            }
            // Watch if an image is loading to place the preloader
            addWatch(function () {
                return self.$loading;
            }, function (newVal, oldVal) {
                if (newVal !== oldVal && angular.isDefined(self.$cropContainer) && globalOptions.preloader) {
                    self.$cropContainer.toggleClass(globalOptions.loadingClass, newVal);
                }
            });
        }

        // Check if the source changes to update the ovelayed copy image
        function observeSource() {
            sourceObserver = $attrs.$observe('ngSrc', function (value) {
                if (!initialized) {
                    return;
                }
                changingSrc = true;
                if (angular.isUndefined(value)) {
                    removeUI();
                    changingSrc = false;
                    return;
                }
                if (angular.isUndefined(modelWatcher)) {
                    options($scope.$eval($attrs[globalOptions.optionsPrefix + 'Options']));
                    startWatching();
                }
                // Disable the crop until the image is loaded
                disableCrop(true);
                // Update the overlayed image source
                UIScope.imgSrc = value;
                // Set the dimensions for the new image
                setDimensions().then(function () {
                    if (angular.isUndefined($scope.$eval($attrs.croppable))) {
                        setArea({width: 0, height: 0, left: 0, top: 0});
                    }
                    else {
                        setArea(angular.extend({}, self.$data, $scope.$eval($attrs.croppable)));
                    }
                    changingSrc = false;
                    enableCrop();
                });
            });
            // Add to watchlist to deregister on UI removal
            // watchList.push(observer);
        }

        function unobserveSource() {
            if (angular.isUndefined(sourceObserver)) {
                return false;
            }
            sourceObserver();
            sourceObserver = undefined;
            return true;
        }

        // ------------ EVENT BINGINGS/UNBINDINGS ------------ //

        // Bind the cropping events
        function enableCrop() {
            // If the crop is not active then attach listeners and set as active
            if (self.$active === false && angular.isDefined($attrs.ngSrc)) {
                // If the crop show is defined and false don't enable the cropper
                if (angular.isDefined($attrs[globalOptions.optionsPrefix + 'Show']) && !!$scope.$eval($attrs[globalOptions.optionsPrefix + 'Show']) === false) {
                    return self;
                }
                // Build interface if it hasn't been built yet
                if (angular.isUndefined(self.$cropContainer)) {
                    buildInterface();
                }
                // The cropper is now ready to manipulate
                self.$active = true;
                self.$cropContainer.on('touchstart mousedown', selectionStart).addClass('crop-active');
                self.$cropHandles.children().on('touchstart mousedown', pickResizeHandle);
                self.$cropper.on('touchstart mousedown', moveCropStart);
                angular.element($window).on('resize', windowResized);
                if ($attrs.hasOwnProperty(globalOptions.optionsPrefix + 'Show')) {
                    $parse($attrs[globalOptions.optionsPrefix + 'Show']).assign($scope, true);
                }
                updateInterface('onEnable');
            }
            return self;
        }

        // Unbind the cropping events
        function disableCrop(temp) {
            // If the crop hasn't been enabled then move on
            if (self.$active === true) {
                self.$active = false;
                self.$cropContainer.off('touchstart mousedown', selectionStart).removeClass('crop-active');
                self.$cropHandles.children().off('touchstart mousedown', pickResizeHandle);
                self.$cropper.off('touchstart mousedown', moveCropStart);
                angular.element($window).off('resize', windowResized);
                // Update the attribute that determines if the cropper is visible except when it is a temporary disable like when loading images
                if ($attrs.hasOwnProperty(globalOptions.optionsPrefix + 'Show') && temp !== true) {
                    $parse($attrs[globalOptions.optionsPrefix + 'Show']).assign($scope, false);
                }
                updateInterface('onDisable');
            }
            return self;
        }

        // When the scope gets destroyed
        $element.on('$destroy', removeUI);

        // ----------------- EVENT HANDLERS ----------------- //

        // When user starts selecting an area
        function selectionStart(event) {
            // ignore right/middle button click
            if (event.button === 2) {
                return;
            }
            // Stop the natural image drag
            event.preventDefault();
            // Listen for the mouse end and move
            angular.element($window).on('touchend mouseup', handleEnd);
            angular.element($window).on('touchmove mousemove', selectionDrag);
            // Save coordinate of the drag start
            startCoords = getCoordinates(event);
            // Flag that we are starting a selection area
            self.$selecting = true;
            // Set the values for the new selection area
            self.$measurements.top = 0;
            self.$measurements.left = 0;
            self.$measurements.width = 0;
            self.$measurements.height = 0;
            // New selection new image
            self.$data.base64 = null;
            // Update the interface with the new values
            updateInterface('onSelectStart');
        }

        // When user is actively changing the selection area
        function selectionDrag(event) {
            // If not selecting do nothing
            if (!self.$selecting) {
                return;
            }
            // Prevent the natural image drag
            event.preventDefault();
            // Mouse coordinates relative to image
            currCoords = getCoordinates(event);
            // Calculate selection box width/height
            var width = currCoords.x - startCoords.x;
            var height = currCoords.y - startCoords.y;
            // If aspect ratio is set and we are resizing horizontally
            if (globalOptions.aspectRatio && resizeH) {
                // If height is greater than 0 we are dragging down so the limits are
                // The click start minus the image height is the max we can go before going out of the borders
                if (height > 0) {
                    height = Math.min($element[0].offsetHeight - startCoords.y, Math.abs(Math.round(width / globalOptions.aspectRatio)));
                }
                else {
                    height = Math.min(startCoords.y, Math.abs(Math.round(width / globalOptions.aspectRatio)));
                }
                // width  = Math.round(height * globalOptions.aspectRatio);
                width = height * globalOptions.aspectRatio;
            }
            else if (globalOptions.aspectRatio && resizeV) {
                width = width > 0 ? Math.min($element[0].offsetWidth - startCoords.x, Math.abs(height * globalOptions.aspectRatio)) : Math.min(startCoords.x, Math.abs(height * globalOptions.aspectRatio));
                height = width / globalOptions.aspectRatio;
            }
            // Set values of the selection area
            self.$measurements.left = currCoords.x - startCoords.x > 0 || !resizeH ? startCoords.x : Math.max(0, startCoords.x - Math.abs(width));
            self.$measurements.top = currCoords.y - startCoords.y > 0 || !resizeV ? startCoords.y : Math.max(0, startCoords.y - Math.abs(height));
            if (globalOptions.aspectRatio || (resizeH && resizeV)) {
                self.$measurements.width = Math.abs(width);
                self.$measurements.height = Math.abs(height);
            }
            else if (resizeH) {
                self.$measurements.width = Math.abs(width);
            }
            else if (resizeV) {
                self.$measurements.height = Math.abs(height);
            }
            // Update the interface
            updateInterface('onSelect');
        }

        // When user stops selecting or moving an area
        function handleEnd(event) {
            // Stop any further event from hapening
            event.stopPropagation();
            // Reset global for vertical/horizontal resizing
            resizeH = true;
            resizeV = true;
            // Remove listener to the drag/move end
            angular.element($window).off('touchend mouseup', handleEnd);
            // If user was moving the crop, remove the listener and reset the status
            if (self.$moving) {
                angular.element($window).off('touchmove mousemove', moveCropArea);
                self.$moving = false;
                updateInterface('onMoveEnd');
            }
            // If user was selecting an area, remove the listener and reset the status
            else if (self.$selecting) {
                angular.element($window).off('touchmove mousemove', selectionDrag);
                // Set selecting flag to false
                self.$selecting = false;
                updateInterface('onSelectEnd');
                // Clear out the current coordinates for the pointer so that we don't trigger events that rely on this value to be set
                currCoords = undefined;
            }
        }

        // When the user starts to move the selection area
        function moveCropStart(event) {
            // ignore right/middle button click
            if (event.button === 2) {
                return;
            }
            // Stop event on the container so that we can drag and not select
            event.stopPropagation();
            // And stop the default image dragging
            event.preventDefault();
            // If user makes another click while moving just return, like a right click while moving will cause the selection to stick to mouse
            if (self.$moving) {
                return;
            }
            // Listen to the mouse movement
            angular.element($window).on('touchmove mousemove', moveCropArea);
            angular.element($window).on('touchend mouseup', handleEnd);
            // Get the coordinate of the mouse
            var coords = getCoordinates(event);
            // We are starting to move the crop area
            self.$moving = true;
            // The limiting coordinates the mouse can move before the box touches the boudaries
            // once the mouse moves less than this the box is already touching the boudary
            moveBoundaries.posX = coords.x - self.$cropper[0].offsetLeft;
            moveBoundaries.posY = coords.y - self.$cropper[0].offsetTop;
            // Update the interface
            updateInterface('onMoveStart');
        }

        // User is actively moving the selection area
        function moveCropArea(event) {
            // New area new crop image
            self.$data.base64 = null;
            // Get the coordinate of the pointer relative to image
            var coords = getCoordinates(event);
            // Set the values for the selection area
            self.$measurements.left = Math.max(0, Math.min(coords.x - moveBoundaries.posX, $element[0].offsetWidth - self.$cropper[0].offsetWidth));
            self.$measurements.top = Math.max(0, Math.min(coords.y - moveBoundaries.posY, $element[0].offsetHeight - self.$cropper[0].offsetHeight));
            // Update the interface with the new values
            updateInterface('onMove');
        }

        // When user selects a resize handle
        function pickResizeHandle(event) {
            // ignore right/middle button click
            if (event.button === 2) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();

            var handle = angular.element(event.target);
            // Set state of the cropper to selecting
            self.$selecting = true;

            if (handle.hasClass('top-left')) {
                startCoords.x = self.$measurements.left + self.$measurements.width;
                startCoords.y = self.$measurements.top + self.$measurements.height;
            }
            else if (handle.hasClass('top')) {
                resizeH = false;
                startCoords.x = self.$measurements.left;
                startCoords.y = self.$measurements.top + self.$measurements.height;
            }
            else if (handle.hasClass('top-right')) {
                startCoords.x = self.$measurements.left;
                startCoords.y = self.$measurements.top + self.$measurements.height;
            }
            else if (handle.hasClass('right')) {
                resizeV = false;
                startCoords.x = self.$measurements.left;
                startCoords.y = self.$measurements.top;
            }
            else if (handle.hasClass('bottom-right')) {
                startCoords.x = self.$measurements.left;
                startCoords.y = self.$measurements.top;
            }
            else if (handle.hasClass('bottom')) {
                resizeH = false;
                startCoords.x = self.$measurements.left;
                startCoords.y = self.$measurements.top;
            }
            else if (handle.hasClass('bottom-left')) {
                startCoords.x = self.$measurements.left + self.$measurements.width;
                startCoords.y = self.$measurements.top;
            }
            else if (handle.hasClass('left')) {
                resizeV = false;
                startCoords.x = self.$measurements.left + self.$measurements.width;
                startCoords.y = self.$measurements.top;
            }

            // Listen to the mouse movement
            angular.element($window).on('touchmove mousemove', selectionDrag);
            angular.element($window).on('touchend mouseup', handleEnd);
        }

        // When the window gets resized recalculate the crop area and update the interfase
        function windowResized() {
            makeMeasurements();
            updateInterface();
        }

        // ---------------- HELPER FUNCTIONS ---------------- //

        // Get the element top/left offset relative to the document
        // return an object containing each value
        function getElementOffset(elem) {
            // The elements position relative to the viewport
            var position = elem[0].getBoundingClientRect();

            return {
                top: position.top + $window.pageYOffset - $document[0].documentElement.clientTop,
                left: position.left + $window.pageXOffset - $document[0].documentElement.clientLeft
            };
        }

        // Pointer coordinates relative to the image
        // returns an object containg the x and y coordinates
        function getCoordinates(event) {
            // Normalize the event object
            var touches = event.touches && event.touches.length ? event.touches : [event];
            var e = (event.changedTouches && event.changedTouches[0]) ||
                (event.originalEvent && event.originalEvent.changedTouches && event.originalEvent.changedTouches[0]) ||
                touches[0].originalEvent || touches[0];
            // Get the offset of the image relative to the document
            var imageOffset = getElementOffset($element);
            // Distance of click to left border of image
            var x = e.pageX - imageOffset.left;
            // Distace of click to top border of image
            var y = e.pageY - imageOffset.top;
            // Return the position of the pointer relative to image
            // If pointer goes out of the image it will return its boudaries and not the pointers position
            return {
                x: Math.max(0, Math.min(x, $element[0].offsetWidth)),
                y: Math.max(0, Math.min(y, $element[0].offsetHeight))
            };
        }

        // Checks if a cropping area has been created
        // returns true if an area exists or false if it doesn't
        function selectionExists() {
            return self.$measurements.width > 0 || self.$measurements.height > 0;
        }

        // Adds watchers to the watch list so that they can be later removed on $destroy
        function addWatch(expr, cb, objEqual) {
            var watch = $scope.$watch(expr, cb, objEqual || false);
            watchList.push(watch);
        }

        // Builds the true measurements relative to the size of the image
        // based on the measurements of the responsive image
        function makeTrueMeasurements() {
            // The scale ratio of the image
            self.$imgInfo.scaleRatio = Math.min(self.$imgInfo.originalWidth / $element[0].offsetWidth, self.$imgInfo.originalHeight / $element[0].offsetHeight);
            // The true positioning of the crop area relative to the orginal size not the scaled
            self.$data.top = self.$measurements.top * self.$imgInfo.scaleRatio;
            self.$data.left = self.$measurements.left * self.$imgInfo.scaleRatio;
            self.$data.width = self.$measurements.width * self.$imgInfo.scaleRatio;
            self.$data.height = self.$measurements.height * self.$imgInfo.scaleRatio;
        }

        // Builds the crop area measurements from true values, it converts them back to scaled values
        function makeMeasurements() {
            // The scale ratio of the image
            self.$imgInfo.scaleRatio = Math.min(self.$imgInfo.originalWidth / $element[0].offsetWidth, self.$imgInfo.originalHeight / $element[0].offsetHeight);
            // The true positioning of the crop area relative to the orginal size not the scaled
            self.$measurements.top = self.$data.top / self.$imgInfo.scaleRatio;
            self.$measurements.left = self.$data.left / self.$imgInfo.scaleRatio;
            self.$measurements.width = self.$data.width / self.$imgInfo.scaleRatio;
            self.$measurements.height = self.$data.height / self.$imgInfo.scaleRatio;
        }

        // Checks that the measurements are within the limitation set by the options and the image borders
        function validateMeasurements() {
            var vDiff, hDiff;
            // Convert limits to the scale of the image
            var hMax = globalOptions.heightMax ? globalOptions.heightMax / self.$imgInfo.scaleRatio : undefined;
            var wMax = globalOptions.widthMax ? globalOptions.widthMax / self.$imgInfo.scaleRatio : undefined;
            var hMin = globalOptions.heightMin ? globalOptions.heightMin / self.$imgInfo.scaleRatio : undefined;
            var wMin = globalOptions.widthMin ? globalOptions.widthMin / self.$imgInfo.scaleRatio : undefined;
            // If there is no selection do nothing
            if (!selectionExists()) {
                return;
            }
            if (globalOptions.aspectRatio && resizeH) {
                self.$measurements.height = self.$measurements.width / globalOptions.aspectRatio;
            }
            else if (globalOptions.aspectRatio && resizeV) {
                self.$measurements.width = self.$measurements.height * globalOptions.aspectRatio;
            }
            // Check if selected area width isn't over the max-width
            if (wMax && self.$measurements.width > wMax && wMax > wMin && !self.$moving) {
                self.$measurements.width = wMax;
                self.$measurements.height = globalOptions.aspectRatio ? hMax : self.$measurements.height;
                self.$measurements.top = currCoords && currCoords.y - startCoords.y < 0 ? startCoords.y - self.$measurements.height : self.$measurements.top;
                self.$measurements.left = currCoords && currCoords.x - startCoords.x < 0 ? startCoords.x - self.$measurements.width : self.$measurements.left;
            }
            // Check if selected area height isn't over the max-height
            if (hMax && self.$measurements.height > hMax && hMax > hMin && !self.$moving) {
                self.$measurements.height = hMax;
                self.$measurements.width = globalOptions.aspectRatio ? wMax : self.$measurements.width;
                self.$measurements.top = currCoords && currCoords.y - startCoords.y < 0 ? startCoords.y - self.$measurements.height : self.$measurements.top;
            }
            // Check if selected area width isn't less than min-width
            if (!self.$selecting && wMin && self.$measurements.width < wMin) {
                self.$measurements.width = wMin;
                self.$measurements.height = globalOptions.aspectRatio ? hMin : self.$measurements.height;
            }
            // Check if selected area height isn't less than min-height
            if (!self.$selecting && hMin && self.$measurements.height < hMin) {
                self.$measurements.height = hMin;
                self.$measurements.width = globalOptions.aspectRatio ? wMin : self.$measurements.width;
            }
            // Check that the measurements don't go over the images border
            hDiff = $element[0].offsetWidth - (self.$measurements.left + self.$measurements.width);
            vDiff = $element[0].offsetHeight - (self.$measurements.top + self.$measurements.height);
            // If the horizontal difference is less than 0 it means it is over the border
            if (hDiff < 0) {
                self.$measurements.width = self.$measurements.left + hDiff < 0 ? $element[0].offsetWidth : self.$measurements.width;
                self.$measurements.left = self.$measurements.left + hDiff < 0 ? 0 : self.$measurements.left + hDiff;
            }
            if (vDiff < 0) {
                self.$measurements.height = self.$measurements.top + vDiff < 0 ? $element[0].offsetHeight : self.$measurements.height;
                self.$measurements.top = self.$measurements.top + vDiff < 0 ? 0 : self.$measurements.top + vDiff;
            }
            // Make true measurements again in case they were changed
            makeTrueMeasurements();
        }

        // Validate the values provided to the directives options
        function validateOptions() {
            // Normalize the widthMax, widthMin, heightMax and heightMin if an aspect ratio is set
            if (globalOptions.aspectRatio && globalOptions.widthMax) {
                globalOptions.heightMax = globalOptions.widthMax / globalOptions.aspectRatio;
            }
            else if (globalOptions.aspectRatio && globalOptions.heightMax) {
                globalOptions.widthMax = globalOptions.heightMax * globalOptions.aspectRatio;
            }

            if (globalOptions.aspectRatio && globalOptions.widthMin) {
                globalOptions.heightMin = globalOptions.widthMin / globalOptions.aspectRatio;
            }
            else if (globalOptions.aspectRatio && globalOptions.heightMin) {
                globalOptions.widthMin = globalOptions.heightMin * globalOptions.aspectRatio;
            }
            $timeout(function () {
                // Check that the options were being watch, function return true if so
                var watchOpt = unwatchOptions();
                // Update the options object attribute
                $parse($attrs[globalOptions.optionsPrefix + 'Options']).assign($scope, globalOptions);
                // If the options were being watched, attach back
                if (watchOpt) {
                    watchOptions();
                }
            });
        }

        // Run any registered callback and events for an specific action
        function runCallback(action) {
            // If action is defined and is string generate the callback name
            var callback = angular.isString(action) ? action : undefined;
            // If the callback is not valid or undefined then do nothing
            if (angular.isUndefined(callback) || contains(validCallbacks, callback) === false) {
                return false;
            }
            // Run callback and emit event, then run a digest cycle
            $timeout(function () {
                // Build the event name to emit
                var evt = action.match(/\^?before/) !== null && action.match(/\^?before/)[0] === 'before' ? action : action.replace(/\^?on/, '').lcfirst();
                // Run the callback
                self[callback]();
                // And emit the event
                $scope.$emit(globalOptions.eventPrefix + '.' + evt, self.$data, self, $scope.$eval($attrs.cropData));
            }, 0);
        }

        // Update the values in the provided model
        function updateModel() {
            // Apply the results to the scope variable passed in the croppable attribute
            $timeout(function () {
                // Clone the true measurments data so it won't update by reference
                var temp = {
                    width: Math.round(self.$data.width),
                    height: Math.round(self.$data.height),
                    top: Math.round(self.$data.top),
                    left: Math.round(self.$data.left),
                    base64: self.$data.base64,
                }
                // Unwatch the model so that we can modify it without triggering a change
                unwatchModel();
                // Update the model with the calculated data
                $parse($attrs.croppable).assign($scope, temp);
                // Watch back for changes to the model made externally only if the cropper has been initialized
                if (initialized) {
                    watchModel();
                }
            });
        }

        // -------------- GETTERS AND SETTERS -------------- //

        // Builds a temporary canvas in memory to crop the image and retrieve the data of it
        // returns void
        function makeCropData() {
            var tempCanvas, tempCanvasCtx;
            // If there is no selection or the source is being changed simply return
            if (changingSrc) {
                return;
            }
            // If selecting an area or moving an area around, update model with the values
            if (self.$selecting || self.$moving || !selectionExists()) {
                updateModel();
            }
            // If autocropping is enable, crop the image with canvas API
            else if (globalOptions.autoCropping) {
                // Create a canvas in memory
                tempCanvas = $document[0].createElement('canvas');
                // Set the canvas width/height to the values of the selection area multiplied by the scale ratio
                tempCanvas.width = self.$data.width;
                tempCanvas.height = self.$data.height;
                // Get the canvas context
                tempCanvasCtx = tempCanvas.getContext('2d');
                // Lets draw the image into the canvas cropping it according to the selection
                tempCanvasCtx.drawImage($element[0], self.$data.left, self.$data.top, self.$data.width, self.$data.height, 0, 0, self.$data.width, self.$data.height);
                // In case the image dow not comply with same origin policy we don't break the code
                try {
                    // Save it to our global crop data
                    self.$data.base64 = tempCanvas.toDataURL('image/' + globalOptions.imageType);
                }
                catch (ex) {
                    // If image is not same origin then log error
                    $log.error(ex.message);
                }
                finally {
                    updateModel();
                    return self.$data.base64;
                }
            }
        }

        // Sets the originalWidth and originalHeight of the source image, as well as the scaled width and height and the scaling ration
        function setDimensions() {
            // Run before loading callback
            runCallback('beforeImageLoad');
            // Set the waiting flag to true
            self.$loading = true;
            // Create a deferred response which will be solved when the image is loaded
            var deferred = $q.defer();
            // Create a new image to obtain the raw width and height
            var image = new Image();
            // When image is loaded set the values to the global variable
            image.onload = function () {
                self.$data.base64 = null;
                self.$imgInfo.originalWidth = image.width;
                self.$imgInfo.originalHeight = image.height;
                // Resolve the promise
                deferred.resolve();
                self.$loading = false;
                runCallback('onImageLoad');
            };
            image.src = $attrs.ngSrc;
            return deferred.promise;
        }

        // Sets the options for the directive
        function options(option, value) {
            option = option || CroppableDefaults;

            if (angular.isObject(option)) {
                globalOptions = angular.extend({}, CroppableDefaults, option);
            }
            else if (angular.isDefined(value) && angular.isString(option)) {
                globalOptions[option] = value;
            }
            else if (angular.isString(option) && angular.isUndefined(value)) {
                return globalOptions[option];
            }
            validateOptions();
            if (!changingSrc) {
                updateInterface();
            }

            return self;
        }

        // Iterate through each available callback and either set it to noop or the user defined expression
        function setCallbacks() {
            angular.forEach(validCallbacks, function (cb) {
                if (angular.isDefined($attrs[globalOptions.optionsPrefix + cb.ucfirst()])) {
                    self[cb] = function () {
                        $scope.$eval($attrs[globalOptions.optionsPrefix + cb.ucfirst()], {
                            $data: self.$data,
                            $croppable: self
                        });
                    };
                }
                else {
                    self[cb] = angular.noop;
                }
            });
        }

        // Resets the values of the cropper and the interface
        function resetCropper() {
            if (selectionExists()) {
                self.$data = {top: 0, left: 0, width: 0, height: 0, base64: null};
                makeMeasurements();
                updateInterface('onReset');
            }
            return self;
        }

        // Sets values for crop area and updates the interface after updating the values
        function setArea(measurement, value) {
            if (angular.isUndefined(measurement)) {
                return self;
            }
            else if (angular.isArray(measurement)) {
                self.$data.top = angular.isDefined(measurement[0]) && angular.isNumber(measurement[0]) ? measurement[0] : self.$data.top;
                self.$data.left = angular.isDefined(measurement[1]) && angular.isNumber(measurement[1]) ? measurement[1] : self.$data.left;
                self.$data.width = angular.isDefined(measurement[2]) && angular.isNumber(measurement[2]) ? measurement[2] : self.$data.width;
                self.$data.height = angular.isDefined(measurement[3]) && angular.isNumber(measurement[3]) ? measurement[3] : self.$data.height;
            }
            else if (angular.isObject(measurement)) {
                self.$data = angular.extend({}, self.$data, measurement);
            }
            else if (angular.isString(measurement) && angular.isNumber(value)) {
                self.$data[measurement] = value;
            }
            makeMeasurements();
            startCoords = {
                x: self.$measurements.left,
                y: self.$measurements.top
            }
            validateMeasurements();
            return self;
        }

        // ------------------ DIRECTIVE API ----------------- //

        self.$options = options;
        self.$clear = resetCropper;
        self.$toggle = function () {
            if (self.$active) {
                return self.disableCrop();
            }
            else {
                return self.enableCrop();
            }
        };
        self.$cropIt = function (measurement, value) {
            if (angular.isDefined(measurement)) {
                self.setArea(measurement, value);
            }
            else {
                return self.makeCropData();
            }
        };
        self.$destroy = function () {
            // Temporarily remove the $destroy listener so that we don't trigger it while removing the UI
            // $element.off('$destroy', removeUI);
            // Remove the generated UI and reset everything
            removeUI();
            // Attach the $destroy event for when the image tag gets deleted
            // $element.on('$destroy', removeUI);
            return self;
        };
        self.$init = function (opts) {
            // If already initialized just notify and move on
            if (initialized) {
                $log.info('The cropper has already been initialized!');
                return;
            }
            // Set the options for the cropper
            options(opts);
            // Set callbacks
            setCallbacks();
            // If the ngSrc is not empty load image and enable cropper
            if (angular.isDefined($attrs.ngSrc)) {
                // Set the dimension for the image
                setDimensions().then(function () {
                    // Set crop area if provided
                    setArea($scope.$eval($attrs.croppable));
                    // Enable the cropper
                    enableCrop();
                    // Start watchers after the image is ready
                    startWatching();
                    // After image is loaded start observing for changes on the source
                    observeSource();
                    // Run ready callback and event
                    runCallback('onReady');
                    // Change directive state to initialized
                    // It is wrapped in a timeout function so it runs at the end of everything and runs a digest cycle with it
                    $timeout(function () {
                        initialized = self.$initialized = true;
                    });
                });
            }
            // Else observe for when the ngSrc changes to initialize the cropper
            else {
                observeSource();
                // Change directive state to initialized
                // It is wrapped in a timeout function so it runs at the end of everything and runs a digest cycle with it
                $timeout(function () {
                    initialized = self.$initialized = true;
                });
            }
            return self;
        };
    }]);

    // ------------------ DIRECTIVE CONTRUCTION ------------------ //
    croppable.directive('croppable', ['$parse', '$interpolate', 'CroppableDefaults', function ($parse, $interpolate, CroppableDefaults) {
        return {
            // Since can only be used on img tags
            restict: 'A',
            // Priority before attribute interpolation
            priority: 100,
            controller: 'CroppableController',
            link: {
                pre: function (scope, element, attrs, cropCtrl) {
                    // We need to save the ngSrc raw value before interpolation, because when the value is undefined
                    // and the cropper gets removed, on DOM cleanup the ngSrc attribute doesn't get copied over because the replaceWith won't set undefined attributes
                    // therefore we need to know the initial string to manually put it back.
                    cropCtrl.$srcAttr = attrs.ngSrc;
                },
                post: function (scope, element, attrs, cropCtrl) {
                    // If the element is not an image cancel out
                    if (element[0].tagName !== 'IMG') {
                        throw 'The croppable element must be an image tag!';
                    }
                    else if (!attrs.hasOwnProperty('ngSrc') && !attrs.hasOwnProperty('src')) {
                        throw 'The image tag has no ngSrc or src attribute, croppable directive can\'t function without this';
                    }
                    // Directives options
                    var options = {};
                    // If user provided an options object attribute
                    if (attrs.hasOwnProperty('cropOptions') && angular.isDefined(attrs.cropOptions) && angular.isObject(scope.$eval(attrs.cropOptions))) {
                        options = angular.extend(options, scope.$eval(attrs.cropOptions));
                    }
                    // For each available options check if user has set an individual option in the attributes
                    for (var option in CroppableDefaults) {
                        if (angular.isDefined(scope.$eval(attrs[CroppableDefaults.optionsPrefix + option.ucfirst()]))) {
                            options[option] = scope.$eval(attrs[CroppableDefaults.optionsPrefix + option.ucfirst()]);
                        }
                    }
                    // Create the cropper
                    cropCtrl.$init(options);
                    // Attach the instance to the $scope if provided a name
                    if (attrs.hasOwnProperty(cropCtrl.$options('optionsPrefix') + 'Name') && angular.isString(attrs[cropCtrl.$options('optionsPrefix') + 'Name'])) {
                        cropCtrl.$name = $interpolate(attrs[cropCtrl.$options('optionsPrefix') + 'Name'])(scope)
                        $parse(CroppableDefaults.directiveName + '.' + cropCtrl.$name).assign(scope, cropCtrl);
                    }
                }
            }
        };
    }]);

})(window.angular);