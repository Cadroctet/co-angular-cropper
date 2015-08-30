// Include gulp
var gulp = require('gulp'); 

// Include Our Plugins
var sass = require('gulp-sass');
var uglify = require('gulp-uglify');
var rename = require('gulp-rename');
var clean = require('gulp-clean');

// Clean Dist dir

gulp.task('clean-css', function () {
  return gulp.src('dist/css/*.css', {read: false})
    .pipe(clean());
});

gulp.task('clean-scripts', function () {
  return gulp.src('dist/js/*.js', {read: false})
    .pipe(clean());
});


// Compile Our Sass
gulp.task('sass', ['clean-css'], function() {
    return gulp.src('src/scss/*.scss')
        .pipe(sass())
        .pipe(gulp.dest('dist/css'));
});

// Uglify JS
gulp.task('uglify', ['clean-scripts'], function() {
    return gulp.src('src/js/co-angular-cropper.js')
        .pipe(rename('co-angular-cropper.min.js'))
        .pipe(uglify())
        .pipe(gulp.dest('dist/js'));
});

gulp.task('copy', function() {
 // Copy JS
 gulp.src('src/js/*.js')
 .pipe(gulp.dest('dist/js'));
 });

// Default Task
gulp.task('default', ['sass', 'uglify', 'copy']);