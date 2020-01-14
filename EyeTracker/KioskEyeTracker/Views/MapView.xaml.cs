using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Windows.ApplicationModel;
using Windows.Devices.Input.Preview;
using Windows.Foundation;
using Windows.Storage;
using Windows.UI.Core;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Input;
using Windows.UI.Xaml.Media;
using Windows.UI.Xaml.Navigation;
using FrameworkElement = Windows.UI.Xaml.FrameworkElement;

namespace KioskEyeTracker.Views
{
    public sealed partial class MapView : Page
    {
        private GazeInputSourcePreview _gazeInputSource;
        private GazeDeviceWatcherPreview _gazeDeviceWatcher;
        private readonly ApplicationDataContainer _localSettings = ApplicationData.Current.LocalSettings;
        private readonly List<Point> _cache = new List<Point>();
        private readonly MediaElement _mediaElement = new MediaElement();
        private int _deviceCounter;
        private int _xOffset;
        private int _yOffset;
        private bool _isRecording;
        private string _previousArea;

        public MapView()
        {
            InitializeComponent();
            HideAllAds();
            LoadSettings();
            CoreWindow.GetForCurrentThread().PointerMoved += GazeMouseMoved;

        }

        private async Task PlaySalesResponse()
        {
            var folder = await Package.Current.InstalledLocation.GetFolderAsync("Assets");
            var file = await folder.GetFileAsync("SalesResponse.wav");
            var stream = await file.OpenAsync(FileAccessMode.Read);
            _mediaElement.SetSource(stream, file.ContentType);
            _mediaElement.Play();
        }

        private bool FindStoreArea(FrameworkElement feItem)
        {
            var foundArea = false;
            var areaName = TryGetArea(feItem);
            if (areaName != null)
            {
                foundArea = true;

                // Update elements visibility based on previous displayed area
                if (_previousArea == null || !_previousArea.Equals(areaName))
                {
                    // Hide the previous ad
                    if (_previousArea != null)
                    {
                        ShowAd(_previousArea, Visibility.Collapsed);
                    }

                    _previousArea = areaName;
                    // Show the new ad
                    ShowAd(areaName, Visibility.Visible);
                }
            }
            return foundArea;
        }

        private string TryGetArea(FrameworkElement feItem)
        {
            if (feItem != null && feItem.Name.StartsWith("Area", StringComparison.Ordinal))
            {
                var re = new Regex(@"\d+");
                var m = re.Match(feItem.Name);
                if (m.Success)
                {
                    return $"Area{feItem.Name.Replace("Area", "").Replace("Group", "").Replace("Ad", "").Replace("Image", "")}";
                }
            }

            return null;
        }

        private void HideAllAds()
        {
            foreach (var ad in new[] { Ad1, Ad2, Ad3, Ad4, Ad5, Ad6, Ad7, Ad8, Ad10, Ad12, Ad13 })
            {
                ad.Visibility = Visibility.Collapsed;
            }
        }

        private void ShowAd(string areaName, Visibility visibility)
        {
            var adName = areaName.Replace("Area", "Ad");
            if (Grid.FindName(adName) is Canvas adControl)
            {
                adControl.Visibility = visibility;
            }
        }

        protected override void OnNavigatedTo(NavigationEventArgs e)
        {
            StartGazeDeviceWatcher();
        }

        protected override void OnNavigatedFrom(NavigationEventArgs e)
        {
            StopGazeDeviceWatcher();
        }

        private void StartGazeDeviceWatcher()
        {
            if (_gazeDeviceWatcher != null) return;
            _gazeDeviceWatcher.Added += DeviceAdded;
            _gazeDeviceWatcher.Updated += DeviceUpdated;
            _gazeDeviceWatcher.Removed += DeviceRemoved;
            _gazeDeviceWatcher.Start();

        }

        private void StopGazeDeviceWatcher()
        {
            if (_gazeDeviceWatcher == null) return;
            _gazeDeviceWatcher.Stop();
            _gazeDeviceWatcher.Added -= DeviceAdded;
            _gazeDeviceWatcher.Updated -= DeviceUpdated;
            _gazeDeviceWatcher.Removed -= DeviceRemoved;
            _gazeDeviceWatcher = null;
        }

        private void DeviceAdded(GazeDeviceWatcherPreview source,
            GazeDeviceWatcherAddedPreviewEventArgs args)
        {
            if (IsSupportedDevice(args.Device))
            {
                _deviceCounter++;
            }

            // Set up gaze tracking
            TryEnableGazeTrackingAsync(args.Device);
        }

        private void DeviceUpdated(GazeDeviceWatcherPreview source,
            GazeDeviceWatcherUpdatedPreviewEventArgs args)
        {
            // Set up gaze tracking
            TryEnableGazeTrackingAsync(args.Device);
        }

        private void DeviceRemoved(GazeDeviceWatcherPreview source,
            GazeDeviceWatcherRemovedPreviewEventArgs args)
        {
            // Decrement gaze device counter and remove event handlers
            if (IsSupportedDevice(args.Device))
            {
                _deviceCounter--;

                if (_deviceCounter == 0)
                {
                    _gazeInputSource.GazeEntered -= GazeEntered;
                    _gazeInputSource.GazeMoved -= GazeTrackerMoved;
                    _gazeInputSource.GazeExited -= GazeExited;
                }
            }
        }

        private async void TryEnableGazeTrackingAsync(GazeDevicePreview gazeDevice)
        {
            // If eye-tracking device is ready, declare event handlers and start tracking.
            if (IsSupportedDevice(gazeDevice))
            {
                // This must be called from the UI thread.
                _gazeInputSource = GazeInputSourcePreview.GetForCurrentView();

                _gazeInputSource.GazeEntered += GazeEntered;
                _gazeInputSource.GazeMoved += GazeTrackerMoved;
                _gazeInputSource.GazeExited += GazeExited;
            }
            // Notify if device calibration required.
            else if (gazeDevice.ConfigurationState ==
                GazeDeviceConfigurationStatePreview.UserCalibrationNeeded ||
                gazeDevice.ConfigurationState ==
                GazeDeviceConfigurationStatePreview.ScreenSetupNeeded)
            {
                // Device isn't calibrated, so invoke the calibration handler.
                Debug.WriteLine("Your device needs to calibrate. Please wait for it to finish.");

                await gazeDevice.RequestCalibrationAsync();
            }
            // Notify if device calibration underway.
            else if (gazeDevice.ConfigurationState ==
                GazeDeviceConfigurationStatePreview.Configuring)
            {
                // Device is currently undergoing calibration.  
                // A device update is sent when calibration complete.
                Debug.WriteLine("Your device is being configured. Please wait for it to finish");
            }
            // Device is not viable.
            else if (gazeDevice.ConfigurationState == GazeDeviceConfigurationStatePreview.Unknown)
            {
                // Notify if device is in unknown state.  
                // Reconfigure/recalibrate the device.  
                Debug.WriteLine("Your device is not ready. Please set up your device or reconfigure it.");
            }
        }

        private bool IsSupportedDevice(GazeDevicePreview gazeDevice)
        {
            return gazeDevice.CanTrackEyes &&
                gazeDevice.ConfigurationState ==
                GazeDeviceConfigurationStatePreview.Ready;
        }

        private void GazeEntered(
            GazeInputSourcePreview sender,
            GazeEnteredPreviewEventArgs args)
        {
            // Mark the event handled
            args.Handled = true;
        }

        private void GazeExited(
            GazeInputSourcePreview sender,
            GazeExitedPreviewEventArgs args)
        {
            // Mark the event handled
            args.Handled = true;
        }

        private void GazeMouseMoved(CoreWindow sender, PointerEventArgs e)
        {
            // Get the x and y coordinates of the mouse pointer.
            GazeMoved(e.CurrentPoint.Position.X, e.CurrentPoint.Position.Y);
        }

        private void GazeTrackerMoved(GazeInputSourcePreview sender, GazeMovedPreviewEventArgs args)
        {
            // Update the position of the ellipse corresponding to gaze point
            if (args.CurrentPoint.EyeGazePosition != null)
            {
                var gazePointX = args.CurrentPoint.EyeGazePosition.Value.X;
                var gazePointY = args.CurrentPoint.EyeGazePosition.Value.Y;
                GazeMoved(gazePointX, gazePointY);

                // Mark the event handled
                args.Handled = true;
            }
        }

        private void GazeMoved(double positionX, double positionY)
        {
            // Update the position of the ellipse corresponding to gaze point
            var gazePointX = positionX + _xOffset;
            var gazePointY = positionY + _yOffset;
            var gazePoint = new Point(gazePointX, gazePointY);

            if (_cache.Count >= 50)
            {
                _cache.RemoveAt(0);
            }

            _cache.Add(gazePoint);
            gazePoint = new Point((int)_cache.Average(x => x.X), (int)_cache.Average(x => x.Y));

            var ellipseLeft =
                gazePoint.X -
                EyeGazePositionEllipse.Width / 2;
            var ellipseTop =
                gazePoint.Y -
                EyeGazePositionEllipse.Height / 2;

            var transform = new TranslateTransform
            {
                X = ellipseLeft,
                Y = ellipseTop
            };
            EyeGazePositionEllipse.RenderTransform = transform;

            // Display Ad
            var foundArea = false;
            var elements = VisualTreeHelper.FindElementsInHostCoordinates(gazePoint, Grid, true).ToList();
            foreach (var item in elements)
            {
                if (item is FrameworkElement feItem && !string.IsNullOrEmpty(feItem.Name))
                {
                    foundArea = FindStoreArea(feItem);
                    if (foundArea) break;
                }
            }

            if (!foundArea && _previousArea != null)
            {
                ShowAd(_previousArea, Visibility.Collapsed);
                _previousArea = null;
            }
        }

        private void ToggleSettings(object sender, RoutedEventArgs e)
        {
            SettingsMenu.IsPaneOpen = !SettingsMenu.IsPaneOpen;
        }

        private void LoadSettings()
        {
            var x = _localSettings.Values[Constants.XOffsetKey];
            var y = _localSettings.Values[Constants.YOffsetKey];

            if (x != null)
            {
                _xOffset = Convert.ToInt32(x);
                XOffsetTb.Text = x.ToString();
            }

            if (y != null)
            {
                _yOffset = Convert.ToInt32(y);
                YOffsetTb.Text = y.ToString();
            }
        }

        private void XOffsetTb_LostFocus(object sender, RoutedEventArgs e)
        {
            var isNumeric = int.TryParse(XOffsetTb.Text, out var number);
            if (!isNumeric)
            {
                XOffsetTb.Text = _xOffset.ToString();
                return;
            }
            _localSettings.Values[Constants.XOffsetKey] = XOffsetTb.Text;
            _xOffset = number;
        }

        private void YOffsetTb_LostFocus(object sender, RoutedEventArgs e)
        {
            var isNumeric = int.TryParse(YOffsetTb.Text, out var number);
            if (!isNumeric)
            {
                YOffsetTb.Text = _yOffset.ToString();
                return;
            }
            _localSettings.Values[Constants.YOffsetKey] = YOffsetTb.Text;
            _yOffset = number;
        }

        private async void OnMicElementTapped(object sender, RoutedEventArgs e)
        {
            _isRecording = !_isRecording;
            if (!_isRecording)
            {
                await PlaySalesResponse();
            }
        }
    }
}
