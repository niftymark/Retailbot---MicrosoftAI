using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace ChatBot.Models
{
    public class BingMapsApiResult
    {
        public string AuthenticationResultCode { get; set; }

        public string BrandLogoUri { get; set; }

        public string Copyright { get; set; }

        public IEnumerable<ResourceSetModel> ResourceSets { get; set; }

        public int StatusCode { get; set; }

        public string StatusDescription { get; set; }

        public string TraceId { get; set; }
    }

    public class ResourceSetModel
    {
        public int EstimatedTotal { get; set; }

        public IEnumerable<ResourceModel> Resources { get; set; }
    }

    public class ResourceModel
    {
        public IEnumerable<RouteResult> Results { get; set; }
    }

    public class RouteResult
    {
        public double TravelDistance { get; set; }

        public double TravelDuration { get; set; }
    }

    public class DistanceMatrixRequest
    {
        public List<Coordinate> Origins { get; set; }

        public List<Coordinate> Destinations { get; set; }

        public string TravelMode { get; set; }
    }

    public class Coordinate
    {
        public Coordinate()
        {
        }

        public Coordinate(double latitude, double longitude)
        {
            Latitude = latitude;
            Longitude = longitude;
        }

        public double Longitude { get; set; }

        public double Latitude { get; set; }
    }
}
