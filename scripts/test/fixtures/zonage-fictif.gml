<?xml version='1.0' encoding="UTF-8" ?>
<!-- Zonage fictif pour les tests : deux secteurs inventés, coordonnées en latitude, longitude comme le WFS. -->
<wfs:FeatureCollection xmlns:ms="http://mapserver.gis.umn.edu/mapserver" xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:wfs="http://www.opengis.net/wfs/2.0" numberMatched="2" numberReturned="2">
    <wfs:member>
      <ms:l_zonage_oll_bordeaux>
        <ms:geometry>
          <gml:MultiSurface gml:id=".1" srsName="urn:ogc:def:crs:EPSG::4326">
            <gml:surfaceMember>
              <gml:Polygon gml:id=".2">
                <gml:exterior>
                  <gml:LinearRing>
                    <gml:posList srsDimension="2">44.83 -0.59 44.83 -0.57 44.85 -0.57 44.85 -0.59 44.83 -0.59 </gml:posList>
                  </gml:LinearRing>
                </gml:exterior>
                <gml:interior>
                  <gml:LinearRing>
                    <gml:posList srsDimension="2">44.835 -0.585 44.835 -0.58 44.84 -0.58</gml:posList>
                  </gml:LinearRing>
                </gml:interior>
              </gml:Polygon>
            </gml:surfaceMember>
          </gml:MultiSurface>
        </ms:geometry>
        <ms:INSEE_COM>33063</ms:INSEE_COM>
        <ms:NOM_COM>Bordeaux</ms:NOM_COM>
        <ms:IRIS>0001</ms:IRIS>
        <ms:CODE_IRIS>330630001</ms:CODE_IRIS>
        <ms:NOM_IRIS>Secteur fictif 1</ms:NOM_IRIS>
        <ms:TYP_IRIS>H</ms:TYP_IRIS>
        <ms:ZET_lib>BORDEAUX_Secteur fictif 1</ms:ZET_lib>
        <ms:Zonage_val>1</ms:Zonage_val>
      </ms:l_zonage_oll_bordeaux>
    </wfs:member>
    <wfs:member>
      <ms:l_zonage_oll_bordeaux>
        <ms:geometry>
          <gml:MultiSurface gml:id=".3" srsName="urn:ogc:def:crs:EPSG::4326">
            <gml:surfaceMember>
              <gml:Polygon gml:id=".4">
                <gml:exterior>
                  <gml:LinearRing>
                    <gml:posList srsDimension="2">44.83 -0.57 44.83 -0.55 44.85 -0.55 44.85 -0.57 44.83 -0.57</gml:posList>
                  </gml:LinearRing>
                </gml:exterior>
              </gml:Polygon>
            </gml:surfaceMember>
          </gml:MultiSurface>
        </ms:geometry>
        <ms:INSEE_COM>33063</ms:INSEE_COM>
        <ms:CODE_IRIS>330630002</ms:CODE_IRIS>
        <ms:NOM_IRIS>Secteur fictif 2</ms:NOM_IRIS>
        <ms:Zonage_val>2</ms:Zonage_val>
      </ms:l_zonage_oll_bordeaux>
    </wfs:member>
</wfs:FeatureCollection>
