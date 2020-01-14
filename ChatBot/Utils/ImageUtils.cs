using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using ChatBot.Models;
using SkiaSharp;

namespace ChatBot.Utils
{
    public static class ImageUtils
    {
        [SuppressMessage("Microsoft.Usage", "CA2213:DisposableFieldsShouldBeDisposed", Justification = "Avoiding Improper Instantiation antipattern : https://docs.microsoft.com/en-us/azure/architecture/antipatterns/improper-instantiation/")]
        private static readonly HttpClient Client = new HttpClient(new HttpClientHandler { UseCookies = true });

        public static Stream CopyImageStream(Stream sourceStream)
        {
            var memoryStream = new MemoryStream();
            sourceStream.CopyTo(memoryStream);
            sourceStream.Position = 0;
            memoryStream.Position = 0;
            return memoryStream;
        }

        public static async Task<byte[]> GetImageAsync(string imageUrl)
        {
            return await Client.GetByteArrayAsync(imageUrl);
        }

        public static async Task<Stream> GetImageStreamAsync(string imageUrl)
        {
            return await Client.GetStreamAsync(imageUrl);
        }

        public static async Task<CroppedImage> GetCroppedImageAsync(string imageInputUrl, double left, double top, double width, double height)
        {
            var input = await GetImageAsync(imageInputUrl);
            using (var bitmap = SKBitmap.Decode(input))
            using (var image = SKImage.FromBitmap(bitmap))
            {
                using (var subset = image.Subset(SKRectI.Create((int)(left * image.Width), (int)(top * image.Height), (int)(width * image.Width), (int)(height * image.Height))))
                using (var finalImage = SKBitmap.FromImage(subset))
                {
                    using (var stream = new MemoryStream())
                    using (var streamWrapper = new SKManagedWStream(stream))
                    {
                        finalImage.PeekPixels().Encode(streamWrapper, SKEncodedImageFormat.Jpeg, 95);
                        return new CroppedImage
                        {
                            Image = stream.ToArray(),
                            Width = finalImage.Width,
                            Height = finalImage.Height,
                        };
                    }
                }
            }
        }

        public static async Task<Image> GetImageFromUrlsAsync(string imageUrl)
        {
            return Image.FromStream(await GetImageStreamAsync(imageUrl));
        }

        public static async Task<BoundingRectangle> GetBoundingRectangleAsync(double boxTop, double boxLeft, double boxWidth, double boxHeight, string imageUrl)
        {
            var image = await GetImageFromUrlsAsync(imageUrl);
            double regularX = boxLeft * image.Width;
            double regularY = boxTop * image.Height;
            double regularWidth = boxWidth * image.Width;
            double regularHeight = boxHeight * image.Height;

            BoundingRectangle result = new BoundingRectangle
            {
                TopLeft = new BoundingCoordinate { X = regularX, Y = regularY },
                TopRight = new BoundingCoordinate { X = regularWidth, Y = regularY },
                BottomLeft = new BoundingCoordinate { X = regularX, Y = regularHeight },
                BottomRight = new BoundingCoordinate { X = regularWidth, Y = regularHeight },
            };

            return result;
        }
    }
}
